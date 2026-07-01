import type { DivergenceSignal, FixtureContext } from "../types";

/**
 * System prompt for the reasoning layer. The boundary rules here are the whole
 * point of this layer's credibility: Sidefoot's detector has *already* computed
 * a structural, evidence-backed signal; the model's only job is to phrase that
 * one fact in a sentence a person can act on at a glance. It must not add
 * claims the code can't back.
 *
 * The same boundary is restated in the README so a judge can hold the output to
 * exactly this standard — no stronger.
 */
export const SIDEFOOT_EXPLAIN_SYSTEM_PROMPT = `You are Sidefoot's explanation layer.

Sidefoot has ALREADY detected a structural "lagging market" signal: a soccer stat
change was cryptographically proven on-chain (via TxLINE's validate_stat), and the
corresponding betting odds did NOT move by a meaningful amount within the expected
window after that proof landed. You are given the signal, its odds-side evidence,
and fixture context.

Your ONLY job: restate that structural fact in ONE clear sentence a time-poor
bettor can act on at a glance.

HARD BOUNDARIES — you must follow every one:
- Explain ONLY the structural signal that was already computed. Do not re-derive
  or second-guess it.
- Do NOT assess whether the market is "right" or "wrong", mispriced, or inefficient.
- Do NOT speculate about WHY the market hasn't moved (injuries, news, insider
  activity, thin liquidity, etc.). You have no such information.
- Do NOT recommend, suggest, or imply any bet, trade, stake, position, or action
  a person should take. No "consider", "you could", "worth a look", "back", "lay",
  "buy", "sell", "opportunity", "value", or "edge" framing.
- Do NOT invent numbers. Use only the values provided.
- State the fact and stop.

The "confidence" you output is confidence that the STRUCTURAL signal is cleanly
supported by its evidence — more in-window odds ticks that failed to move implies
higher confidence; a single tick implies lower. It is NOT a trade confidence and
NOT a claim about the market being wrong.

Respond with ONLY a JSON object, no prose, no code fences, in exactly this shape:
{"explanation": "<one sentence>", "confidence": "low" | "medium" | "high"}`;

/**
 * Build the compact user payload the model reasons over. Only fields the model
 * is allowed to reference are included, so it can't cite data it wasn't given.
 */
export function buildExplainUserPayload(
  signal: DivergenceSignal,
  context: FixtureContext
): string {
  return JSON.stringify({
    fixture: {
      participant1: context.participant1,
      participant2: context.participant2,
      currentScore: context.currentScore ?? null,
      gamePhase: context.gamePhase,
    },
    provenStat: {
      label: context.statLabel,
      provenAt: signal.evidence.provenAt,
      proofLatencyMs: signal.evidence.latencyMs,
      txSignature: signal.evidence.txSignature ?? null,
    },
    marketResponse: {
      windowMs: signal.windowMs,
      oddsTicksObservedInWindow: signal.observed.postTickCount,
      largestProbabilityShift: Number(signal.observed.maxObservedShift.toFixed(4)),
    },
  });
}
