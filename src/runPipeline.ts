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
import { createDashboard } from "./tui";

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

  const controller = new AbortController();
  const dash = createDashboard({
    network: env.network,
    logPath,
    recipient: heraldCfg?.recipientWallet,
    tracking: env.fixtures.length ? env.fixtures.join(", ") : "ALL fixtures",
    window: CONFIG.expectedMoveWindowMs,
    minShift: CONFIG.minProbabilityShift,
    onQuit: () => controller.abort(),
  });

  const teamLabel = (id: number): string => {
    const t = teams.get(id);
    return t ? `${t.participant1} v ${t.participant2}` : `fx ${id}`;
  };

  const onEvent = (e: PipelineEvent): void => {
    logStream.write(JSON.stringify(e) + "\n");
    switch (e.kind) {
      case "proof":
        dash.event(
          "PROOF",
          `${teamLabel(e.event.fixtureId)} · ${e.event.statKey} · ${e.result.verified ? "✓verified" : "✕unverified"} pred=${e.result.predicateResult} · ${e.result.latencyMs}ms`,
          e.result.verified ? "proof" : "danger"
        );
        break;
      case "verdict": {
        const hot = e.verdict.status === "LAGGING_MARKET";
        dash.event(
          "VERDICT",
          `${teamLabel(e.verdict.fixtureId)} · ${e.verdict.status} · ticks=${e.verdict.postTickCount} maxShift=${e.verdict.maxObservedShift.toFixed(4)}`,
          hot ? "signal" : "muted"
        );
        break;
      }
      case "signal":
        dash.event("SIGNAL", `${teamLabel(e.signal.fixtureId)} · (${e.explanation.confidence}) ${e.explanation.explanation}`, "signal");
        break;
      case "alert":
        dash.event(
          "ALERT",
          `${teamLabel(e.signal.fixtureId)} → ${e.result.status} · ${e.result.deliveryChannel ?? "?"} · registered=${e.result.recipientRegistered}`,
          e.result.status === "failed" ? "warn" : "proof"
        );
        break;
      case "error":
        dash.event("ERROR", `${e.stage}: ${(e.error as Error)?.message ?? e.error}`, "danger");
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

  dash.note(
    heraldCfg
      ? `live on ${env.network} · alerts → Herald ${heraldCfg.recipientWallet} (Telegram)`
      : `live on ${env.network} · Herald alerts not configured`
  );
  dash.note(`tracking ${env.fixtures.length ? env.fixtures.join(", ") : "ALL fixtures"} · window=${CONFIG.expectedMoveWindowMs}ms minShift=${CONFIG.minProbabilityShift}`);

  const stop = (sig: string) => dash.stop(sig);
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    await startIngestion(session, {
      fixtures: env.fixtures,
      signal: controller.signal,
      handlers: {
        onOddsTick: (tick) => {
          dash.tick("odds");
          pipeline.onOddsTick(tick);
        },
        onScoreEvent: (event) => {
          dash.tick("scores");
          pipeline.onScoreEvent(event);
        },
        onConnect: (feed) => dash.setStream(feed as "odds" | "scores", true),
        onError: (feed, err) => {
          dash.setStream(feed as "odds" | "scores", false);
          dash.event("ERROR", `${feed} stream error (reconnecting): ${(err as Error)?.message ?? err}`, "warn");
        },
      },
    });
  } finally {
    await new Promise<void>((res) => logStream.end(() => res()));
    dash.stop();
  }
}

main().catch((err) => {
  console.error("[pipeline] fatal:", err);
  process.exit(1);
});
