import { Herald } from "@herald-protocol/sdk";
import type { NetworkConfig } from "txline-anchor";
import type { DivergenceSignal, FixtureContext, SignalExplanation } from "../types";
import type { HeraldConfig } from "../env";
import { formatAlert } from "./format";

/**
 * The alert delivery boundary. Sidefoot pushes a confirmed signal to a bettor's
 * Telegram through Herald (the notification gateway) — the demo's hook: a phone
 * buzzing the instant a proof lands.
 *
 * `Alerter` is injected into the pipeline so the orchestration is testable
 * without a network; `createHeraldAlerter` is the real implementation over the
 * `@herald-protocol/sdk` client (auto-targets the production gateway from the
 * `hrld_live_` key prefix).
 */
export interface AlertResult {
  notificationId: string;
  status: string;
  deliveryChannel: string | null;
  recipientRegistered: boolean | null;
}

export interface Alerter {
  send(
    signal: DivergenceSignal,
    explanation: SignalExplanation,
    context: FixtureContext
  ): Promise<AlertResult>;
}

/** Stable idempotency key so a re-fired signal doesn't double-buzz within 24h. */
function idempotencyKey(signal: DivergenceSignal): string {
  return `sidefoot_${signal.fixtureId}_${signal.statKey}_${signal.evidence.provenAt}`.slice(0, 128);
}

export function createHeraldAlerter(cfg: HeraldConfig, network: NetworkConfig): Alerter {
  const herald = new Herald({ apiKey: cfg.apiKey });

  return {
    async send(signal, explanation, context): Promise<AlertResult> {
      const { subject, body } = formatAlert(signal, explanation, context, network);
      const res = await herald.notify({
        wallet: cfg.recipientWallet,
        subject,
        body,
        category: cfg.category,
        priority: cfg.priority,
        preferredChannel: "telegram",
        receipt: cfg.receipt,
        idempotencyKey: idempotencyKey(signal),
      });
      return {
        notificationId: res.notificationId,
        status: res.status,
        deliveryChannel: res.deliveryChannel,
        recipientRegistered: res.recipientRegistered,
      };
    },
  };
}
