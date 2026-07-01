import type { Confidence, SignalExplanation } from "../types";

/**
 * Parsing + boundary enforcement for the reasoning layer's output.
 *
 * Two independent guards, both testable without a live model:
 *  1. `parseSignalExplanation` — the output must be a JSON object with a
 *     non-empty `explanation` string and a valid `confidence` enum. Tolerates a
 *     ```json code fence and surrounding whitespace; throws on anything else.
 *  2. `assertWithinBoundary` — a defence-in-depth check that the explanation
 *     doesn't drift into trade advice or market-judgement, independent of
 *     whatever the model actually returned. This is what lets the "never
 *     recommends a trade" claim be verified in tests, not just asserted.
 */

export class ExplanationError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "ExplanationError";
  }
}

const CONFIDENCES: readonly Confidence[] = ["low", "medium", "high"];

/** Strip a leading/trailing ```json ... ``` fence if present. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence?.[1]?.trim() ?? trimmed;
}

export function parseSignalExplanation(raw: string): SignalExplanation {
  const body = stripCodeFence(raw);

  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    throw new ExplanationError("reasoning output was not valid JSON", raw);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new ExplanationError("reasoning output was not a JSON object", raw);
  }

  const { explanation, confidence } = obj as Record<string, unknown>;
  if (typeof explanation !== "string" || explanation.trim().length === 0) {
    throw new ExplanationError("reasoning output missing a non-empty explanation", raw);
  }
  if (typeof confidence !== "string" || !CONFIDENCES.includes(confidence as Confidence)) {
    throw new ExplanationError(
      `reasoning output confidence must be one of ${CONFIDENCES.join("/")}`,
      raw
    );
  }

  return { explanation: explanation.trim(), confidence: confidence as Confidence };
}

/**
 * Phrases that would breach the boundary — trade recommendations, or claims the
 * market is wrong/mispriced. Matched case-insensitively on word boundaries.
 */
const BOUNDARY_VIOLATIONS: RegExp[] = [
  /\bback\b/i,
  /\blay\b/i,
  /\bbet\b/i,
  /\bstake\b/i,
  /\bwager\b/i,
  /\bbuy\b/i,
  /\bsell\b/i,
  /\bposition\b/i,
  /\bopportunit(?:y|ies)\b/i,
  /\bvalue\b/i,
  /\bedge\b/i,
  /\bmispric/i,
  /\binefficien/i,
  /\byou (?:should|could|can|might)\b/i,
  /\bconsider\b/i,
  /\bworth (?:a )?(?:look|considering)\b/i,
  /\brecommend/i,
];

/**
 * Throw if the explanation strays into trade advice or market-judgement. Applied
 * after parsing so a boundary breach fails loudly rather than reaching a user.
 */
export function assertWithinBoundary(explanation: SignalExplanation): void {
  const hit = BOUNDARY_VIOLATIONS.find((re) => re.test(explanation.explanation));
  if (hit) {
    throw new ExplanationError(
      `explanation breached the reasoning boundary (matched ${hit})`,
      explanation.explanation
    );
  }
}
