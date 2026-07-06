import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getFixturesSnapshot,
  getScoresHistorical,
  getScoresSnapshot,
  getOddsSnapshot,
  getOddsUpdates,
  decodeStatKey,
  type Fixture,
} from "txline-anchor";
import { loadEnv, loadReasoningConfig } from "./env";
import { bootstrapSession, type Session } from "./session";
import { normalizeOdds, normalizeScores } from "./normalize";
import { proveScoreEvent, isProofWorthy } from "./prover";
import { evaluateLaggingMarket, detectLaggingMarket, type LaggingMarketConfig } from "./detector";
import { gamePhaseLabel, statKeyLabel } from "./gamePhase";
import { createAnthropicPort } from "./reasoning/llm";
import { explainSignal } from "./reasoning/explain";
import type { OddsTick, ScoreEvent, SignalExplanation } from "./types";

/**
 * Build a REAL dashboard feed from live TxLINE devnet data (`pnpm feed`).
 *
 * Everything written is real: team names + odds come from TxLINE's fixtures /
 * odds endpoints, and any proof marker is a genuine on-chain `validate_stat` tx.
 * Fixtures are ranked so the ones actually trading (live odds) come first; a
 * fixture that also has a proven goal gets the full lagging-market treatment.
 *
 * Bounded — each real proof is a ~1.4M-CU tx that costs SOL.
 */

const CONFIG: LaggingMarketConfig = { expectedMoveWindowMs: 20_000, minProbabilityShift: 0.03 };
const POLL_MS = 4_000;
const WATCH_MS = 24_000; // top up the getOddsUpdates history with a few live polls
const MAX_FIXTURES = 3;
const MAX_PROOFS = 2;
const MAX_POINTS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tsIso = (ms: number): string => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString());

interface FeedFixture {
  fixtureId: number;
  participant1: string;
  participant2: string;
  gamePhase: string;
  currentScore?: string;
  marketLabel: string;
  odds: { t: string; p: number }[];
  proofs: { provenAt: string; statLabel: string; txSignature?: string; latencyMs: number }[];
  signals: unknown[];
}

interface BoardFixture {
  fixtureId: number;
  participant1: string;
  participant2: string;
  competition: string;
  competitionId: number;
  startTime: string;
  status: "live" | "scheduled" | "finished";
  /** True when TxLINE is quoting odds for it right now (may be pre-match). */
  trading: boolean;
  /** "1-0" for started matches, else undefined. */
  score?: string;
}

const LIVE_STATES = new Set(["1H", "H1", "2H", "H2", "HT", "ET", "ET1", "ET2", "PEN", "LIVE", "INPLAY", "IN_PLAY"]);
const DONE_STATES = new Set(["FT", "AET", "ENDED", "FINISHED", "AP", "ABANDONED", "POSTPONED", "CANC", "CANCELLED"]);

function normStart(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}
const MATCH_MS = 150 * 60_000; // a match is over ~2.5h after kickoff

/**
 * Status from kickoff time first (TxLINE's GameState isn't a reliable
 * finished/scheduled signal), with GameState + score data as confirmation.
 */
function classifyStatus(rawGameState: string, startIso: string, started: boolean): "live" | "scheduled" | "finished" {
  const p = (rawGameState || "").toUpperCase();
  if (LIVE_STATES.has(p) || /^\d/.test(p)) return "live";
  if (DONE_STATES.has(p)) return "finished";
  const start = startIso ? Date.parse(startIso) : NaN;
  const now = Date.now();
  if (Number.isFinite(start)) {
    if (now >= start + MATCH_MS) return "finished";
    if (now >= start - 5 * 60_000) return "live";
    return "scheduled";
  }
  // No kickoff time — fall back to whether the match has produced any scores.
  return started ? "finished" : "scheduled";
}
function writeBoard(network: string, board: BoardFixture[]): void {
  const byComp = new Map<string, BoardFixture[]>();
  for (const f of board) {
    const k = `${f.competitionId}|${f.competition}`;
    (byComp.get(k) ?? byComp.set(k, []).get(k)!).push(f);
  }
  const competitions = [...byComp.values()]
    .map((fixtures) => ({
      competition: fixtures[0]!.competition,
      competitionId: fixtures[0]!.competitionId,
      fixtures: fixtures.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .sort((a, b) => a.competition.localeCompare(b.competition));
  const out = resolve("dashboard/public/fixtures.json");
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), network, competitions }, null, 2) + "\n");
  const live = board.filter((f) => f.status === "live").length;
  const trading = board.filter((f) => f.trading).length;
  console.log(`[feed] wrote ${out} — ${board.length} fixtures, ${live} live, ${trading} trading, ${competitions.length} competition(s).`);
}

const seriesKeyOf = (t: OddsTick): string => `${t.market}|${t.selection}|${t.bookmakerId}`;

/** Pick the most match-winner-like series, favouring the home participant. */
function pickSeries(ticks: OddsTick[], p1: string): { key: string; label: string } | null {
  const groups = new Map<string, OddsTick[]>();
  for (const t of ticks) (groups.get(seriesKeyOf(t)) ?? groups.set(seriesKeyOf(t), []).get(seriesKeyOf(t))!).push(t);
  const home = p1.toLowerCase();
  // TxLINE encodes 1X2 selections as part1 / part2 / draw — part1 is the home side.
  const isHome = (sel: string) => sel === "part1" || sel === "1" || sel === "home" || (home.length > 2 && sel.includes(home));
  let best: { key: string; label: string; score: number } | null = null;
  for (const [key, arr] of groups) {
    const s = arr[0]!;
    const sel = s.selection.toLowerCase();
    const mkt = s.market.toLowerCase();
    const homeish = isHome(sel);
    let score = arr.length;
    if (homeish) score += 200;
    if (/1x2|participant_result|winner|result|match/.test(mkt)) score += 30;
    if (/half=/.test(mkt)) score -= 60; // prefer the full-game market
    if (sel === "draw" || sel === "part2" || sel === "2") score -= 50;
    if (s.impliedProbability > 0.12 && s.impliedProbability < 0.9) score += 5;
    if (!best || score > best.score) best = { key, label: homeish ? `Match winner — ${p1}` : `${s.market} — ${s.selection}`, score };
  }
  return best ? { key: best.key, label: best.label } : null;
}

/** Real odds series for a fixture: recent history (getOddsUpdates) + a few live polls. */
async function captureOdds(session: Session, fixtureId: number): Promise<OddsTick[]> {
  const ticks: OddsTick[] = [];
  const seen = new Set<string>();
  const add = (arr: OddsTick[]) => {
    for (const t of arr) {
      const id = `${t.messageId}|${t.selection}|${t.receivedAt}`;
      if (seen.has(id)) continue;
      seen.add(id);
      ticks.push(t);
    }
  };
  try {
    for (const p of await getOddsUpdates(session.client, fixtureId)) add(normalizeOdds(p, tsIso(p.Ts)));
  } catch {
    /* fall back to polling */
  }
  const started = Date.now();
  while (Date.now() - started < WATCH_MS) {
    try {
      for (const p of await getOddsSnapshot(session.client, fixtureId)) add(normalizeOdds(p, tsIso(p.Ts)));
    } catch {
      /* ignore */
    }
    await sleep(POLL_MS);
  }
  return ticks;
}

/** Goals for one side (base 1 = P1, 2 = P2): full-game total if present, else sum of periods. */
function goalsFor(events: ScoreEvent[], base: 1 | 2): number {
  let full = 0;
  let hasFull = false;
  const periods = new Map<number, number>();
  for (const e of events) {
    if (e.statKey === base) {
      full = Math.max(full, e.value);
      hasFull = true;
    } else {
      try {
        const d = decodeStatKey(e.statKey);
        if (d.base === base && d.period !== "FULL_GAME") periods.set(e.statKey, Math.max(periods.get(e.statKey) ?? 0, e.value));
      } catch {
        /* not a decodable stat */
      }
    }
  }
  return hasFull ? full : [...periods.values()].reduce((a, b) => a + b, 0);
}

async function fixtureScores(
  session: Session,
  fixtureId: number
): Promise<{ goal?: ScoreEvent; phase: string; raw: string; started: boolean; score?: string }> {
  const now = new Date().toISOString();
  const events: ScoreEvent[] = [];
  let raw = "";
  for (const fetch of [() => getScoresSnapshot(session.client, fixtureId), () => getScoresHistorical(session.client, fixtureId)]) {
    try {
      for (const row of await fetch()) {
        if (row.GameState) raw = row.GameState;
        events.push(...normalizeScores(row, now));
      }
    } catch {
      /* pre-match 404 */
    }
  }
  const goals = events.filter(isProofWorthy);
  const started = events.length > 0;
  const score = started ? `${goalsFor(events, 1)}-${goalsFor(events, 2)}` : undefined;
  return { goal: goals[goals.length - 1], phase: gamePhaseLabel(raw || events[events.length - 1]?.gameState || ""), raw, started, score };
}

async function buildFixture(
  session: Session,
  fx: Fixture,
  canProve: boolean,
  explain: ((s: any, c: any) => Promise<SignalExplanation>) | null
): Promise<FeedFixture | null> {
  const fixtureId = fx.FixtureId;
  console.log(`[feed] ${fixtureId} — ${fx.Participant1} v ${fx.Participant2}`);
  const { goal, phase, raw, started, score } = await fixtureScores(session, fixtureId);
  // Kickoff-time status is reliable; TxLINE GameState isn't. Use an in-play
  // label if we have one, else the status word.
  const status = classifyStatus(raw, normStart(fx.StartTime), started);
  const gamePhase =
    status === "live" ? (phase && phase !== "scheduled" ? phase : "Live") : status === "finished" ? "Full Time" : "Pre-match";

  const ticks = await captureOdds(session, fixtureId);
  const picked = pickSeries(ticks, fx.Participant1);
  const seriesTicks = picked ? ticks.filter((t) => seriesKeyOf(t) === picked.key) : [];
  const odds = seriesTicks
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
    .map((t) => ({ t: t.receivedAt, p: Number(t.impliedProbability.toFixed(4)) }))
    .filter((pt, i, a) => i === 0 || pt.p !== a[i - 1]!.p || i === a.length - 1) // drop consecutive dupes
    .slice(-MAX_POINTS);
  console.log(`[feed]   odds points: ${odds.length}${picked ? ` (${picked.label})` : ""}`);

  const proofs: FeedFixture["proofs"] = [];
  const signals: FeedFixture["signals"] = [];

  if (canProve && goal) {
    try {
      console.log(`[feed]   proving ${statKeyLabel(goal.statKey)} (seq ${goal.seq})…`);
      const res = await proveScoreEvent({ program: session.program, client: session.client }, goal, { record: true });
      if (res.signature) proofs.push({ provenAt: res.provenAt, statLabel: statKeyLabel(goal.statKey), txSignature: res.signature, latencyMs: res.latencyMs });
      console.log(`[feed]   proof ${res.verified ? "✓" : "predicate-false"} tx=${res.signature ?? "-"} ${res.latencyMs}ms`);

      if (res.signal) {
        const verdict = evaluateLaggingMarket(res.signal, seriesTicks, CONFIG);
        console.log(`[feed]   verdict=${verdict.status} ticks=${verdict.postTickCount}`);
        const signal = detectLaggingMarket(res.signal, seriesTicks, CONFIG);
        if (signal) {
          const context = { fixtureId, participant1: fx.Participant1, participant2: fx.Participant2, gamePhase, statLabel: statKeyLabel(signal.statKey) };
          let ex: SignalExplanation = {
            explanation: `${fx.Participant1}'s ${context.statLabel} is proven on-chain, but across ${signal.observed.postTickCount} ${picked?.label ?? "market"} update(s) in the ${CONFIG.expectedMoveWindowMs / 1000}s after the proof the odds shifted at most ${(signal.observed.maxObservedShift * 100).toFixed(2)}%.`,
            confidence: signal.observed.postTickCount >= 3 ? "high" : "medium",
          };
          if (explain) {
            try {
              ex = await explain(signal, context);
            } catch (e) {
              console.warn(`[feed]   explain failed: ${(e as Error).message}`);
            }
          }
          signals.push({
            detectedAt: signal.detectedAt,
            statLabel: context.statLabel,
            explanation: ex.explanation,
            confidence: ex.confidence,
            maxObservedShift: signal.observed.maxObservedShift,
            postTickCount: signal.observed.postTickCount,
            windowMs: signal.windowMs,
            provenAt: signal.evidence.provenAt,
            scoreEventReceivedAt: signal.evidence.scoreEventReceivedAt,
            txSignature: signal.evidence.txSignature,
            latencyMs: signal.evidence.latencyMs,
          });
        }
      }
    } catch (e) {
      console.warn(`[feed]   prove failed: ${(e as Error).message}`);
    }
  }

  if (odds.length === 0 && proofs.length === 0) {
    console.log(`[feed]   nothing usable — skip`);
    return null;
  }

  return {
    fixtureId,
    participant1: fx.Participant1,
    participant2: fx.Participant2,
    gamePhase,
    ...(score ? { currentScore: score } : {}),
    marketLabel: picked?.label ?? "Match winner",
    odds,
    proofs,
    signals,
  };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const session = await bootstrapSession(env);

  let explain: ((s: any, c: any) => Promise<SignalExplanation>) | null = null;
  try {
    const port = createAnthropicPort(loadReasoningConfig());
    explain = (s, c) => explainSignal(s, c, port);
    console.log("[feed] reasoning layer enabled");
  } catch {
    console.log("[feed] reasoning layer not configured — factual explanations");
  }

  const all = await getFixturesSnapshot(session.client);

  // Probe every fixture once for live odds + phase → the fixtures board AND the
  // capture ranking. All real TxLINE data.
  console.log(`[feed] probing ${all.length} fixtures (odds + phase)…`);
  const ranked: { fx: Fixture; hasOdds: boolean; hasGoal: boolean; phase: string; score: number }[] = [];
  const board: BoardFixture[] = [];
  for (const fx of all) {
    let hasOdds = false;
    try {
      hasOdds = (await getOddsSnapshot(session.client, fx.FixtureId)).length > 0;
    } catch {
      /* ignore */
    }
    const { goal, phase, raw, started, score } = await fixtureScores(session, fx.FixtureId);
    const startTime = normStart(fx.StartTime);
    board.push({
      fixtureId: fx.FixtureId,
      participant1: fx.Participant1,
      participant2: fx.Participant2,
      competition: fx.Competition || "Unknown competition",
      competitionId: fx.CompetitionId,
      startTime,
      status: classifyStatus(raw, startTime, started),
      trading: hasOdds,
      score,
    });
    ranked.push({ fx, hasOdds, hasGoal: !!goal, phase, score: (hasOdds ? 2 : 0) + (goal ? 1 : 0) });
  }

  writeBoard(env.network, board);
  if (process.argv.includes("--board")) {
    console.log("[feed] board-only mode — feed.json unchanged.");
    return;
  }
  ranked.sort((a, b) => b.score - a.score);
  const chosen = ranked.filter((r) => r.hasOdds || r.hasGoal).slice(0, MAX_FIXTURES);
  console.log(`[feed] chosen: ${chosen.map((c) => `${c.fx.Participant1} v ${c.fx.Participant2}[odds=${c.hasOdds} goal=${c.hasGoal}]`).join(", ")}`);

  const fixtures: FeedFixture[] = [];
  let proofs = 0;
  for (const { fx, hasGoal } of chosen) {
    const entry = await buildFixture(session, fx, hasGoal && proofs < MAX_PROOFS, explain);
    if (entry) {
      fixtures.push(entry);
      proofs += entry.proofs.length;
    }
  }

  if (fixtures.length === 0) {
    console.log("[feed] no usable data — feed.json unchanged.");
    return;
  }

  const feed = { generatedAt: new Date().toISOString(), network: env.network, explorerCluster: session.cfg.explorerCluster, sample: false, fixtures };
  const out = resolve("dashboard/public/feed.json");
  writeFileSync(out, JSON.stringify(feed, null, 2) + "\n");
  console.log(
    `[feed] ✅ wrote ${out} — ${fixtures.length} fixture(s), ${proofs} proof(s), ` +
      `${fixtures.reduce((n, f) => n + f.signals.length, 0)} signal(s). All real TxLINE data.`
  );
}

main().catch((err) => {
  console.error("[feed] fatal:", err?.message ?? err);
  process.exit(1);
});
