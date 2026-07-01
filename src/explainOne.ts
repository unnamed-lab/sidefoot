import { loadReasoningConfig } from "./env";
import { createAnthropicPort } from "./reasoning/llm";
import { explainSignal, ExplanationError } from "./reasoning/explain";
import type { DivergenceSignal, FixtureContext } from "./types";

/**
 * Day 6 smoke test: run the reasoning layer against the configured LLM endpoint
 * (Anthropic, or the DeepSeek-compatible endpoint this project's `.env` points
 * at) with a synthetic lagging-market signal, and print the boundary-checked
 * one-line explanation.
 *
 *   pnpm explain
 */
const SIGNAL: DivergenceSignal = {
  type: "LAGGING_MARKET",
  fixtureId: 18179759,
  statKey: 1,
  windowMs: 10_000,
  detectedAt: "2026-07-01T20:00:10.000Z",
  evidence: {
    fixtureId: 18179759,
    statKey: 1,
    provenAt: "2026-07-01T20:00:00.000Z",
    txSlot: 473_304_348,
    txSignature: "5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF",
    scoreEventReceivedAt: "2026-07-01T19:59:46.000Z",
    latencyMs: 14_063,
  },
  observed: {
    maxObservedShift: 0.012,
    postTickCount: 5,
    series: [
      {
        market: "1X2_PARTICIPANT_RESULT",
        selection: "part1",
        bookmakerId: 10021,
        baselineProbability: 0.536,
        maxShift: 0.012,
        postTickCount: 5,
      },
    ],
  },
};

const CONTEXT: FixtureContext = {
  fixtureId: 18179759,
  participant1: "Home",
  participant2: "Away",
  currentScore: "1-0",
  gamePhase: "1st Half",
  statLabel: "P1 goals",
};

async function main(): Promise<void> {
  const cfg = loadReasoningConfig();
  console.log(`[explain] model=${cfg.model} baseUrl=${cfg.baseUrl ?? "(default Anthropic)"}`);
  const port = createAnthropicPort(cfg);

  try {
    const t0 = Date.now();
    const out = await explainSignal(SIGNAL, CONTEXT, port);
    console.log(`[explain] returned in ${Date.now() - t0}ms`);
    console.log(`[explain] confidence: ${out.confidence}`);
    console.log(`[explain] explanation: ${out.explanation}`);
  } catch (err) {
    if (err instanceof ExplanationError) {
      console.error(`[explain] rejected (boundary/parse): ${err.message}\n  raw: ${err.raw}`);
      process.exit(2);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("[explain] fatal:", err);
  process.exit(1);
});
