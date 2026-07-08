import { createHash } from "node:crypto";
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

export interface DeliveryStatus {
  status: string;
  deliveredAt: string | null;
  deliveryChannel: string | null;
}

export interface Alerter {
  send(
    signal: DivergenceSignal,
    explanation: SignalExplanation,
    context: FixtureContext
  ): Promise<AlertResult>;
  /** Poll a notification's delivery status (Herald resolves routing async). */
  status(notificationId: string): Promise<DeliveryStatus>;
}

/**
 * Deterministic v4-format UUID so a re-fired signal reuses the same idempotency
 * key (Herald dedups within 24h) — random `randomUUID()` would lose that, and
 * Herald's API requires the key to validate as a UUID v4. Derived from the
 * signal so the same proof always maps to the same key, even across restarts.
 */
function idempotencyKey(signal: DivergenceSignal): string {
  const seed = `sidefoot:${signal.fixtureId}:${signal.statKey}:${signal.evidence.provenAt}`;
  const b = createHash("sha256").update(seed).digest().subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function createHeraldAlerter(cfg: HeraldConfig | null, network: NetworkConfig): Alerter {
  if (!cfg) {
    return {
      async send(signal, explanation, context): Promise<AlertResult> {
        return {
          notificationId: "disabled",
          status: "skipped",
          deliveryChannel: null,
          recipientRegistered: false,
        };
      },
      async status(notificationId): Promise<DeliveryStatus> {
        return { status: "skipped", deliveredAt: null, deliveryChannel: null };
      },
    };
  }

  const herald = new Herald({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
  });

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
    async status(notificationId): Promise<DeliveryStatus> {
      const s = await herald.getStatus(notificationId);
      return { status: s.status, deliveredAt: s.deliveredAt, deliveryChannel: s.deliveryChannel };
    },
  };
}
