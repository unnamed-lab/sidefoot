import { loadEnv } from "./env";
import { bootstrapSession } from "./session";
import { startIngestion } from "./ingest/worker";
import { ReplayRecorder } from "./ingest/recorder";

/**
 * Background replay recorder (Day 3 deliverable).
 *
 * Connects the live odds + scores SSE feeds and appends every raw frame to a
 * JSONL capture under the data dir. Run it in the background from Day 3 onward
 * so the detector can be tuned and the demo hook replayed against real data:
 *
 *   pnpm record            # all fixtures (or SIDEFOOT_FIXTURES from .env)
 *
 * Stop with Ctrl-C; it flushes and prints the capture totals.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const session = await bootstrapSession(env);
  const recorder = ReplayRecorder.open(env.dataDir, env.network);

  console.log(`[record] writing to ${recorder.filePath}`);
  console.log(
    `[record] tracking ${env.fixtures.length ? env.fixtures.join(", ") : "ALL fixtures"} on ${env.network}`
  );

  const controller = new AbortController();
  const stop = (sig: string) => {
    console.log(`\n[record] ${sig} received — stopping…`);
    controller.abort();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  const statsTimer = setInterval(() => {
    const { odds, scores } = recorder.totals;
    console.log(`[record] captured odds=${odds} scores=${scores}`);
  }, 30_000);

  try {
    await startIngestion(session, {
      fixtures: env.fixtures,
      signal: controller.signal,
      handlers: {
        onOdds: (_p, msg, receivedAt) => recorder.record("odds", msg, receivedAt),
        onScores: (_s, msg, receivedAt) => recorder.record("scores", msg, receivedAt),
        onConnect: (feed, fixtureId) =>
          console.log(`[record] connected ${feed}${fixtureId ? ` fixture=${fixtureId}` : ""}`),
        onError: (feed, err) =>
          console.warn(`[record] ${feed} stream error (will reconnect):`, (err as Error)?.message ?? err),
      },
    });
  } finally {
    clearInterval(statsTimer);
    await recorder.close();
    const { odds, scores } = recorder.totals;
    console.log(`[record] done. Total odds=${odds} scores=${scores} → ${recorder.filePath}`);
  }
}

main().catch((err) => {
  console.error("[record] fatal:", err);
  process.exit(1);
});
