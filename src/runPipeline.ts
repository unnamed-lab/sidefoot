import { createWriteStream, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { getFixturesSnapshot } from "txline-anchor";
import { loadEnv, loadReasoningConfig, loadHeraldConfig } from "./env";
import { bootstrapSession } from "./session";
import { startIngestion } from "./ingest/worker";
import { proveScoreEvent } from "./prover";
import { createAnthropicPort } from "./reasoning/llm";
import { explainSignal } from "./reasoning/explain";
import { createHeraldAlerter } from "./alert/herald";
import { SidefootPipeline, type PipelineEvent } from "./pipeline";
import type { LaggingMarketConfig } from "./detector";

/**
 * Day 7 — the full pipeline, live: ingest odds + scores, prove goals on-chain,
 * wait the market's window, detect lag, explain it, and buzz a phone via Herald.
 *
 *   pnpm start
 *
 * Every step is logged to console and appended to data/signals-*.jsonl so a
 * judge can scroll a real window and check each claim (plan §6). Ctrl-C to stop.
 */

// Starting thresholds — tuned against the replay dataset on Day 10.
const CONFIG: LaggingMarketConfig = {
  expectedMoveWindowMs: 20_000,
  minProbabilityShift: 0.03,
};

async function main(): Promise<void> {
  const env = loadEnv();
  const reasoningCfg = loadReasoningConfig();
  const heraldCfg = loadHeraldConfig();

  const session = await bootstrapSession(env);
  const proverDeps = { program: session.program, client: session.client };
  const reasoningPort = createAnthropicPort(reasoningCfg);
  const alerter = createHeraldAlerter(heraldCfg, session.cfg);

  // Team names for readable alerts, from a one-shot fixtures snapshot.
  const teams = new Map<number, { participant1: string; participant2: string }>();
  try {
    for (const f of await getFixturesSnapshot(session.client)) {
      teams.set(f.FixtureId, { participant1: f.Participant1, participant2: f.Participant2 });
    }
  } catch {
    /* non-fatal — alerts fall back to "Fixture <id> P1/P2" labels */
  }

  // Observability log.
  const dir = resolve(env.dataDir);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(dir, `signals-${env.network}-${stamp}.jsonl`);
  const logStream = createWriteStream(logPath, { flags: "a" });

  const onEvent = (e: PipelineEvent): void => {
    logStream.write(JSON.stringify(e) + "\n");
    switch (e.kind) {
      case "proof":
        console.log(
          `[proof] fx=${e.event.fixtureId} stat=${e.event.statKey} verified=${e.result.verified} ` +
            `predicate=${e.result.predicateResult} latency=${e.result.latencyMs}ms sig=${e.result.signature ?? "-"}`
        );
        break;
      case "verdict":
        console.log(
          `[verdict] fx=${e.verdict.fixtureId} ${e.verdict.status} ticks=${e.verdict.postTickCount} maxShift=${e.verdict.maxObservedShift.toFixed(4)}`
        );
        break;
      case "signal":
        console.log(`[signal] fx=${e.signal.fixtureId} (${e.explanation.confidence}) ${e.explanation.explanation}`);
        break;
      case "alert":
        console.log(
          `[alert] fx=${e.signal.fixtureId} → ${e.result.status} channel=${e.result.deliveryChannel ?? "?"} ` +
            `registered=${e.result.recipientRegistered} id=${e.result.notificationId}`
        );
        break;
      case "error":
        console.warn(`[error] stage=${e.stage}:`, (e.error as Error)?.message ?? e.error);
        break;
    }
  };

  const pipeline = new SidefootPipeline({
    prove: (event) => proveScoreEvent(proverDeps, event, { record: true }),
    explain: (signal, context) => explainSignal(signal, context, reasoningPort),
    alert: (signal, explanation, context) => alerter.send(signal, explanation, context),
    resolveTeams: (id) => teams.get(id),
    config: CONFIG,
    onEvent,
  });

  console.log(
    `[pipeline] live on ${env.network}; alerts → Herald wallet ${heraldCfg.recipientWallet} (Telegram preferred)`
  );
  console.log(`[pipeline] observability log: ${logPath}`);
  console.log(
    `[pipeline] tracking ${env.fixtures.length ? env.fixtures.join(", ") : "ALL fixtures"}; window=${CONFIG.expectedMoveWindowMs}ms minShift=${CONFIG.minProbabilityShift}`
  );

  const controller = new AbortController();
  const stop = (sig: string) => {
    console.log(`\n[pipeline] ${sig} — stopping…`);
    controller.abort();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    await startIngestion(session, {
      fixtures: env.fixtures,
      signal: controller.signal,
      handlers: {
        onOddsTick: pipeline.onOddsTick,
        onScoreEvent: pipeline.onScoreEvent,
        onConnect: (feed, fixtureId) =>
          console.log(`[pipeline] connected ${feed}${fixtureId ? ` fixture=${fixtureId}` : ""}`),
        onError: (feed, err) =>
          console.warn(`[pipeline] ${feed} stream error (reconnecting):`, (err as Error)?.message ?? err),
      },
    });
  } finally {
    await new Promise<void>((res) => logStream.end(() => res()));
    console.log(`[pipeline] stopped. Log → ${logPath}`);
  }
}

main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exit(1);
});
