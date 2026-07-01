import type { DivergenceSignal, FixtureContext, SignalExplanation } from "../types";
import { explorerTxUrl } from "../explorer";
import type { NetworkConfig } from "txline-anchor";

/**
 * Pure formatting of a confirmed signal into the subject + body Herald delivers.
 * No IO — the alerter passes the result to Herald. Telegram renders markdown, so
 * the body uses light markdown; the whole thing stays short enough to buzz a
 * phone and be read at a glance.
 *
 * Every alert leads with Claude's/the reasoning layer's one-line explanation,
 * then the checkable evidence (proof latency, the explorer link to the real
 * validate_stat tx). The explorer link is what makes the alert a proof, not a
 * claim — a judge can tap it and confirm on devnet.
 */
export interface AlertMessage {
  subject: string;
  body: string;
}

/** Herald caps the subject at 150 chars; keep a safe margin and never overflow. */
function clampSubject(s: string): string {
  return s.length <= 150 ? s : `${s.slice(0, 147)}…`;
}

export function formatAlert(
  signal: DivergenceSignal,
  explanation: SignalExplanation,
  context: FixtureContext,
  cfg: NetworkConfig
): AlertMessage {
  const fixture = `${context.participant1} vs ${context.participant2}`;
  const score = context.currentScore ? ` (${context.currentScore})` : "";

  const subject = clampSubject(`⚡ Lagging market — ${fixture}${score}`);

  const latencySec = (signal.evidence.latencyMs / 1000).toFixed(1);
  const shiftPct = (signal.observed.maxObservedShift * 100).toFixed(2);
  const windowSec = (signal.windowMs / 1000).toFixed(0);

  const lines: string[] = [
    `*${fixture}*${score} — _${context.gamePhase}_`,
    "",
    explanation.explanation,
    "",
    `📊 Proven stat: *${context.statLabel}* (confidence: ${explanation.confidence})`,
    `⏱ Market response: ${signal.observed.postTickCount} odds update(s) in ${windowSec}s, max shift ${shiftPct}%`,
    `🔒 Proof round-trip: ${latencySec}s`,
  ];

  if (signal.evidence.txSignature) {
    lines.push("", `🔗 [Verify the on-chain proof](${explorerTxUrl(cfg, signal.evidence.txSignature)})`);
  }

  lines.push("", "_Sidefoot flags when the market lags a proven score event. Not trading advice._");

  return { subject, body: lines.join("\n") };
}
