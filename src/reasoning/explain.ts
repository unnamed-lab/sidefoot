import type { DivergenceSignal, FixtureContext, SignalExplanation } from "../types";
import { SIDEFOOT_EXPLAIN_SYSTEM_PROMPT, buildExplainUserPayload } from "./prompt";
import { parseSignalExplanation, assertWithinBoundary, ExplanationError } from "./parse";
import type { LlmPort } from "./llm";

/**
 * Turn a structural `DivergenceSignal` into one actionable, boundary-safe
 * sentence. The model is only ever asked to phrase a fact the pure detector
 * already computed (see the system prompt).
 *
 * Failure modes are explicit: malformed model output or a boundary breach throw
 * `ExplanationError`. The imperative pipeline (Day 7) wraps this in try/catch —
 * a bad explanation should drop the enrichment and log, never surface an
 * unvetted line to a user.
 */
export async function explainSignal(
  signal: DivergenceSignal,
  context: FixtureContext,
  port: LlmPort
): Promise<SignalExplanation> {
  const raw = await port.complete(
    SIDEFOOT_EXPLAIN_SYSTEM_PROMPT,
    buildExplainUserPayload(signal, context)
  );
  const explanation = parseSignalExplanation(raw);
  assertWithinBoundary(explanation);
  return explanation;
}

export { ExplanationError };
