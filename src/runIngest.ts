import { loadEnv } from "./env";
import { bootstrapSession } from "./session";
import { startIngestion } from "./ingest/worker";
import { decodeStatKey } from "txline-anchor";

/**
 * Console ingestion demo — a quick way to eyeball that the live wiring works
 * end to end (session → both streams → normalization) before the detector,
 * recorder, or dashboard consume the same events.
 *
 *   pnpm ingest
 *
 * Prints normalized odds ticks and score events as they arrive. Ctrl-C to stop.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const session = await bootstrapSession(env);
  console.log(
    `[ingest] streaming ${env.fixtures.length ? env.fixtures.join(", ") : "ALL fixtures"} on ${env.network}`
  );

  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());

  await startIngestion(session, {
    fixtures: env.fixtures,
    signal: controller.signal,
    handlers: {
      onConnect: (feed, fixtureId) =>
        console.log(`[ingest] connected ${feed}${fixtureId ? ` fixture=${fixtureId}` : ""}`),
      onOddsTick: (t) =>
        console.log(
          `[odds ] fx=${t.fixtureId} ${t.market} "${t.selection}" p=${t.impliedProbability.toFixed(3)} bk=${t.bookmakerId}`
        ),
      onScoreEvent: (e) => {
        let label = String(e.statKey);
        try {
          const d = decodeStatKey(e.statKey);
          label = `${d.base}@${d.period}`;
        } catch {
          /* leave raw statKey */
        }
        console.log(
          `[score] fx=${e.fixtureId} seq=${e.seq} stat=${label} val=${e.value} state=${e.gameState}`
        );
      },
      onError: (feed, err) =>
        console.warn(`[ingest] ${feed} error (reconnecting):`, (err as Error)?.message ?? err),
    },
  });
  console.log("[ingest] stopped.");
}

main().catch((err) => {
  console.error("[ingest] fatal:", err);
  process.exit(1);
});
