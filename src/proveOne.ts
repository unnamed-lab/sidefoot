import {
  getFixturesSnapshot,
  getScoresSnapshot,
  getScoresHistorical,
} from "txline-anchor";
import { loadEnv } from "./env";
import { bootstrapSession } from "./session";
import { normalizeScores } from "./normalize";
import { proveScoreEvent, isProofWorthy } from "./prover";
import { explorerTxUrl } from "./explorer";
import type { ScoreEvent } from "./types";

/**
 * Day 5 confirmation: find a real goal in TxLINE's score data and land an actual
 * on-chain `validate_stat` proof for it on devnet, printing the Solana Explorer
 * link. This directly satisfies the proof-of-realness checklist item:
 * "at least one signal traceable to a real validate_stat tx, link resolves".
 *
 *   pnpm prove
 *
 * Bounded: it stops at the FIRST successful verified proof, and caps how many
 * candidates it will attempt (each proof is a real ~1.4M-CU tx that costs SOL).
 */

const MAX_FIXTURES = 12;
const MAX_CANDIDATES_PER_FIXTURE = 3;
const MAX_ATTEMPTS = 8;

/** Collect proof-worthy (goal) events for a fixture from historical + snapshot. */
async function candidateEvents(
  client: Parameters<typeof getScoresSnapshot>[0],
  fixtureId: number
): Promise<ScoreEvent[]> {
  const now = new Date().toISOString();
  const events: ScoreEvent[] = [];
  const sources = [
    () => getScoresHistorical(client, fixtureId),
    () => getScoresSnapshot(client, fixtureId),
  ];
  for (const fetch of sources) {
    try {
      for (const row of await fetch()) events.push(...normalizeScores(row, now));
    } catch {
      /* endpoint 404s for not-yet-started fixtures — fine, try the next source */
    }
  }
  // Dedupe by (seq, statKey) and keep only proof-worthy goals.
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!isProofWorthy(e)) return false;
    const k = `${e.seq}:${e.statKey}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function main(): Promise<void> {
  const env = loadEnv();
  const session = await bootstrapSession(env);
  const deps = { program: session.program, client: session.client };

  const fixtures = env.fixtures.length
    ? env.fixtures
    : (await getFixturesSnapshot(session.client)).map((f) => f.FixtureId);

  console.log(`[prove] scanning up to ${Math.min(fixtures.length, MAX_FIXTURES)} fixtures for a proof-worthy goal…`);

  let attempts = 0;
  for (const fixtureId of fixtures.slice(0, MAX_FIXTURES)) {
    const candidates = (await candidateEvents(session.client, fixtureId)).slice(
      0,
      MAX_CANDIDATES_PER_FIXTURE
    );
    for (const event of candidates) {
      if (attempts >= MAX_ATTEMPTS) {
        console.log(`[prove] hit attempt cap (${MAX_ATTEMPTS}) — stopping to bound tx spend.`);
        return;
      }
      attempts++;
      console.log(
        `[prove] attempt ${attempts}: fixture=${fixtureId} seq=${event.seq} statKey=${event.statKey} value=${event.value}`
      );
      try {
        const res = await proveScoreEvent(deps, event, { record: true });
        console.log(
          `[prove] proof returned in ${res.latencyMs}ms — authentic=${!!res.signature} predicate=${res.predicateResult}`
        );
        if (res.signature) {
          console.log(`[prove] tx: ${explorerTxUrl(session.cfg, res.signature)}`);
        }
        if (res.verified && res.signal) {
          console.log("[prove] ✅ VerifiedSignal:\n" + JSON.stringify(res.signal, null, 2));
          console.log("[prove] done — a real proof landed and the link above resolves on Solana Explorer (devnet).");
          return;
        }
        console.log("[prove] proof authentic but predicate false — trying next candidate.");
      } catch (err) {
        console.warn(`[prove] candidate failed: ${(err as Error).message}`);
      }
    }
  }

  console.log(
    "[prove] no goal could be proven right now (fixtures may be pre-match or not yet committed on-chain). " +
      "Retry during/after a live fixture, or pin one via SIDEFOOT_FIXTURES."
  );
}

main().catch((err) => {
  console.error("[prove] fatal:", err);
  process.exit(1);
});
