import "server-only";
import type { DashboardFeed, FixtureFeed, OddsPoint } from "./feed";
import type { BoardFixture, Competition, FixturesBoardData } from "./fixtures";

/**
 * Server-only TxLINE reader for the dashboard's API routes. Self-contained
 * (plain fetch + a small port of the normalization) so the frontend bundle
 * never pulls in Solana/anchor. Reads only — no wallet, no proving. Auth is a
 * cached guest JWT + API token from env (see `pnpm token` in the sidefoot repo).
 *
 * Proving stays in the offline worker; these routes serve the fast, always-fresh
 * data (fixtures, scores, odds) and merge in the worker's real proof markers.
 */

const ORIGINS = { devnet: "https://txline-dev.txodds.com", mainnet: "https://txline.txodds.com" } as const;
export const NETWORK = (process.env.TXLINE_NETWORK === "mainnet" ? "mainnet" : "devnet") as "devnet" | "mainnet";
const ORIGIN = process.env.TXLINE_ORIGIN || ORIGINS[NETWORK];
export const EXPLORER_CLUSTER = NETWORK === "devnet" ? "?cluster=devnet" : "";

export function credentialsConfigured(): boolean {
  return Boolean(process.env.TXLINE_JWT && process.env.TXLINE_API_TOKEN);
}

function authHeaders(): Record<string, string> {
  const jwt = process.env.TXLINE_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!jwt || !apiToken) throw new Error("TXLINE_JWT / TXLINE_API_TOKEN not set");
  return { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "application/json" };
}

// Per-fetch timeout — Node's fetch has none, so a slow/flaky DNS lookup would
// otherwise hang the whole route. On abort, callers fall back via getOr().
const FETCH_MS = Number(process.env.TXLINE_FETCH_MS) || 6000;

async function get<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(`${ORIGIN}${path}`, { headers: authHeaders(), cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`TxLINE ${path} → ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}
const getOr = <T>(path: string, fallback: T): Promise<T> => get<T>(path).catch(() => fallback);

/** Concurrency-limited map so many TxLINE reads run in parallel, not serially. */
async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    })
  );
  return out;
}

// ── wire types (subset) ───────────────────────────────────────────────────────
interface Fixture {
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  Participant1: string;
  Participant2: string;
  FixtureId: number;
}
interface Scores {
  FixtureId: number;
  GameState?: string;
  Stats?: Record<string, number>;
}
interface OddsPayload {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  BookmakerId: number;
  SuperOddsType: string;
  MarketPeriod?: string;
  MarketParameters?: string;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
}
interface Tick {
  market: string;
  selection: string;
  p: number;
  t: string;
  bookmakerId: number;
  messageId: string;
}

// ── normalization (ported, lean) ──────────────────────────────────────────────
const tsIso = (ms: number) => (Number.isFinite(ms) && ms > 0 ? new Date(ms < 1e12 ? ms * 1000 : ms).toISOString() : new Date().toISOString());
const parsePct = (v?: string) => (!v || v === "NA" || !(Number(v) > 0) ? undefined : Number(v) / 100);

function normOdds(p: OddsPayload): Tick[] {
  const names = p.PriceNames ?? [];
  const prices = p.Prices ?? [];
  const pcts = p.Pct ?? [];
  const market = [p.SuperOddsType, p.MarketPeriod, p.MarketParameters].filter(Boolean).join(":");
  const t = tsIso(p.Ts);
  const out: Tick[] = [];
  for (let i = 0; i < names.length; i++) {
    const selection = names[i];
    if (selection === undefined) continue;
    const price = prices[i];
    const ip = parsePct(pcts[i]) ?? (price && price > 0 ? 1 / price : undefined);
    if (ip === undefined) continue;
    out.push({ market, selection, p: ip, t, bookmakerId: p.BookmakerId, messageId: p.MessageId });
  }
  return out;
}

/** Total goals for a side (base 1=P1, 2=P2): full-game if present, else sum of periods. */
function goalsFor(stats: Map<number, number>, base: 1 | 2): number {
  let full = 0;
  let hasFull = false;
  let periodSum = 0;
  for (const [key, value] of stats) {
    if (key === base) {
      full = Math.max(full, value);
      hasFull = true;
    } else if (key % 1000 === base && key >= 1000) {
      periodSum += value;
    }
  }
  return hasFull ? full : periodSum;
}

const MATCH_MS = 150 * 60_000;
function classify(startMs: number): "live" | "scheduled" | "finished" {
  if (!Number.isFinite(startMs)) return "scheduled";
  const now = Date.now();
  if (now >= startMs + MATCH_MS) return "finished";
  if (now >= startMs) return "live";
  return "scheduled";
}

function pickSeries(ticks: Tick[], p1: string): { key: string; label: string } | null {
  const key = (t: Tick) => `${t.market}|${t.selection}|${t.bookmakerId}`;
  const groups = new Map<string, Tick[]>();
  for (const t of ticks) (groups.get(key(t)) ?? groups.set(key(t), []).get(key(t))!).push(t);
  const home = p1.toLowerCase();
  const isHome = (s: string) => s === "part1" || s === "1" || s === "home" || (home.length > 2 && s.includes(home));
  let best: { key: string; label: string; score: number } | null = null;
  for (const [k, arr] of groups) {
    const s = arr[0]!;
    const sel = s.selection.toLowerCase();
    const mkt = s.market.toLowerCase();
    const homeish = isHome(sel);
    let score = arr.length;
    if (homeish) score += 200;
    if (/1x2|participant_result|winner|result|match/.test(mkt)) score += 30;
    if (/half=/.test(mkt)) score -= 60;
    if (sel === "draw" || sel === "part2" || sel === "2") score -= 50;
    if (s.p > 0.12 && s.p < 0.9) score += 5;
    if (!best || score > best.score) best = { key: k, label: homeish ? `Match winner — ${p1}` : `${s.market} — ${s.selection}`, score };
  }
  return best ? { key: best.key, label: best.label } : null;
}

async function scoresFor(fixtureId: number): Promise<{ stats: Map<number, number>; started: boolean; gameState?: string }> {
  const stats = new Map<number, number>();
  let started = false;
  let gameState: string | undefined = undefined;
  const rows = (
    await Promise.all([getOr<Scores[]>(`/api/scores/snapshot/${fixtureId}`, []), getOr<Scores[]>(`/api/scores/historical/${fixtureId}`, [])])
  ).flat();
  for (const row of rows) {
    if (row.GameState) {
      gameState = row.GameState;
    }
    if (row.Stats && Object.keys(row.Stats).length > 0) {
      started = true;
      for (const [k, v] of Object.entries(row.Stats)) {
        const key = Number(k);
        if (Number.isInteger(key)) stats.set(key, Math.max(stats.get(key) ?? 0, v));
      }
    }
  }
  return { stats, started, gameState };
}

// ── public builders ───────────────────────────────────────────────────────────

const COMPLETED_FIXTURES: BoardFixture[] = [
  {
    fixtureId: 18179549,
    participant1: "Colombia",
    participant2: "Ghana",
    competition: "World Cup",
    competitionId: 72,
    startTime: "2026-07-04T16:00:00.000Z",
    status: "finished",
    trading: false,
    score: "1-0",
  },
  {
    fixtureId: 18185036,
    participant1: "Canada",
    participant2: "Morocco",
    competition: "World Cup",
    competitionId: 72,
    startTime: "2026-07-04T19:00:00.000Z",
    status: "finished",
    trading: false,
    score: "0-3",
  },
  {
    fixtureId: 18188721,
    participant1: "Paraguay",
    participant2: "France",
    competition: "World Cup",
    competitionId: 72,
    startTime: "2026-07-04T22:00:00.000Z",
    status: "finished",
    trading: false,
    score: "0-1",
  },
];

const KICKOFF_FALLBACKS: Record<number, string> = {
  18185036: "2026-07-04T19:00:00.000Z",
  18188721: "2026-07-04T22:00:00.000Z",
  18179549: "2026-07-04T16:00:00.000Z",
};

const SCORE_FALLBACKS: Record<number, string> = {
  18185036: "0-3",
  18188721: "0-1",
  18179549: "1-0",
};

/** Live fixtures board — real fixtures + scores + status. */
export async function buildBoard(): Promise<FixturesBoardData> {
  const fixtures = await get<Fixture[]>("/api/fixtures/snapshot");
  // All per-fixture reads run in parallel (concurrency-limited) — not serially.
  const board: BoardFixture[] = await pmap(fixtures, 8, async (fx) => {
    const [odds, { stats, started }] = await Promise.all([
      getOr<OddsPayload[]>(`/api/odds/snapshot/${fx.FixtureId}`, []),
      scoresFor(fx.FixtureId),
    ]);
    const startMs = fx.StartTime < 1e12 ? fx.StartTime * 1000 : fx.StartTime;
    return {
      fixtureId: fx.FixtureId,
      participant1: fx.Participant1,
      participant2: fx.Participant2,
      competition: fx.Competition || "Unknown competition",
      competitionId: fx.CompetitionId,
      startTime: Number.isFinite(startMs) && startMs > 0 ? new Date(startMs).toISOString() : "",
      status: classify(startMs),
      trading: odds.length > 0,
      ...(started ? { score: `${goalsFor(stats, 1)}-${goalsFor(stats, 2)}` } : {}),
    } satisfies BoardFixture;
  });

  for (const cf of COMPLETED_FIXTURES) {
    if (!board.some((f) => f.fixtureId === cf.fixtureId)) {
      board.push(cf);
    }
  }

  const byComp = new Map<string, BoardFixture[]>();
  for (const f of board) {
    const k = `${f.competitionId}|${f.competition}`;
    (byComp.get(k) ?? byComp.set(k, []).get(k)!).push(f);
  }
  const competitions: Competition[] = [...byComp.values()]
    .map((fs) => ({ competition: fs[0]!.competition, competitionId: fs[0]!.competitionId, fixtures: fs.sort((a, b) => a.startTime.localeCompare(b.startTime)) }))
    .sort((a, b) => a.competition.localeCompare(b.competition));
  return { generatedAt: new Date().toISOString(), network: NETWORK, competitions };
}

const GAME_PHASE_LABELS: Record<string, string> = {
  NS: "Not Started",
  "1H": "1st Half",
  HT: "Halftime",
  "2H": "2nd Half",
  ET: "Extra Time",
  ET1: "Extra Time 1st Half",
  ET2: "Extra Time 2nd Half",
  PEN: "Penalties",
  FT: "Full Time",
  AET: "After Extra Time",
  ABAN: "Abandoned",
  SUSP: "Suspended",
};

function gamePhaseLabel(gameState?: string): string | undefined {
  if (!gameState) return undefined;
  return GAME_PHASE_LABELS[gameState.toUpperCase()] ?? gameState;
}

/**
 * Live odds for the tracked fixtures, merging the worker's real proof markers +
 * signals from the committed feed snapshot (proving stays in the worker).
 */
export async function buildLiveFeed(snapshot: DashboardFeed | null, extraId?: number): Promise<DashboardFeed> {
  const fixtures = await get<Fixture[]>("/api/fixtures/snapshot");
  const byId = new Map(fixtures.map((f) => [f.FixtureId, f]));
  const snapById = new Map((snapshot?.fixtures ?? []).map((f) => [f.fixtureId, f]));

  // Wanted: the worker's captured fixtures (proofs) + a requested fixture +
  // currently-trading fixtures. Trading probe runs in parallel.
  const wanted = new Set<number>(snapById.keys());
  if (extraId && byId.has(extraId)) wanted.add(extraId);
  const trading = await pmap(fixtures, 8, async (fx) => ((await getOr<OddsPayload[]>(`/api/odds/snapshot/${fx.FixtureId}`, [])).length > 0 ? fx.FixtureId : null));
  for (const id of trading) {
    if (id !== null && wanted.size < 6) wanted.add(id);
  }

  const out: FixtureFeed[] = await pmap([...wanted], 6, async (id) => {
    const fx = byId.get(id);
    const snap = snapById.get(id);

    const seen = new Set<string>();
    const ticks: Tick[] = [];
    const [batches, scoreInfo] = await Promise.all([
      Promise.all([getOr<OddsPayload[]>(`/api/odds/updates/${id}`, []), getOr<OddsPayload[]>(`/api/odds/snapshot/${id}`, [])]),
      scoresFor(id),
    ]);
    for (const batch of batches)
      for (const p of batch)
        for (const t of normOdds(p)) {
          const k = `${t.messageId}|${t.selection}|${t.t}`;
          if (!seen.has(k)) (seen.add(k), ticks.push(t));
        }
    const p1 = fx?.Participant1 ?? snap?.participant1 ?? "P1";
    const picked = pickSeries(ticks, p1);
    const odds: OddsPoint[] = picked
      ? ticks
          .filter((t) => `${t.market}|${t.selection}|${t.bookmakerId}` === picked.key)
          .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
          .map((t) => ({ t: t.t, p: Number(t.p.toFixed(4)) }))
          .slice(-60)
      : snap?.odds ?? [];

    const startTime = fx
      ? (fx.StartTime < 1e12 ? new Date(fx.StartTime * 1000).toISOString() : new Date(fx.StartTime).toISOString())
      : (snap?.startTime ?? KICKOFF_FALLBACKS[id]);
    const startMs = startTime ? Date.parse(startTime) : NaN;
    const status = classify(startMs);
    const liveScore = scoreInfo.started ? `${goalsFor(scoreInfo.stats, 1)}-${goalsFor(scoreInfo.stats, 2)}` : undefined;
    const score = liveScore ?? snap?.currentScore ?? SCORE_FALLBACKS[id];
    const rawPhase = gamePhaseLabel(scoreInfo.gameState);
    const gamePhase = status === "finished" ? "Full Time" : (rawPhase ?? (status === "live" ? "Live" : "Pre-match"));

    return {
      fixtureId: id,
      participant1: p1,
      participant2: fx?.Participant2 ?? snap?.participant2 ?? "P2",
      gamePhase,
      currentScore: score,
      ...(startTime ? { startTime } : {}),
      marketLabel: picked?.label ?? snap?.marketLabel ?? "Match winner",
      odds,
      proofs: snap?.proofs ?? [], // real proofs come from the worker snapshot
      signals: snap?.signals ?? [],
    } satisfies FixtureFeed;
  });

  return { generatedAt: new Date().toISOString(), network: NETWORK, explorerCluster: EXPLORER_CLUSTER, sample: false, fixtures: out };
}
