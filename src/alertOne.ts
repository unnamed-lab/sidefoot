import { networkConfig } from "txline-anchor";
import { loadEnv, loadHeraldConfig } from "./env";
import { createHeraldAlerter } from "./alert/herald";
import type { DivergenceSignal, FixtureContext, SignalExplanation } from "./types";

/**
 * Day 7 smoke test: send one synthetic confirmed signal to the configured
 * Herald recipient's Telegram — the demo's hook, a phone buzzing the instant a
 * proof lands, verified in isolation from the live feed.
 *
 *   pnpm alert
 */
const SIGNAL: DivergenceSignal = {
  type: "LAGGING_MARKET",
  fixtureId: 18179759,
  statKey: 1,
  windowMs: 20_000,
  detectedAt: "2026-07-01T20:00:20.000Z",
  evidence: {
    fixtureId: 18179759,
    statKey: 1,
    provenAt: "2026-07-01T20:00:00.000Z",
    txSlot: 473_304_348,
    txSignature: "5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF",
    scoreEventReceivedAt: "2026-07-01T19:59:46.000Z",
    latencyMs: 14_063,
  },
  observed: { maxObservedShift: 0.012, postTickCount: 5, series: [] },
};

const EXPLANATION: SignalExplanation = {
  explanation:
    "A P1 goal is proven on-chain, yet across 5 odds updates in the following 20 seconds the largest match-winner probability shift was just 1.2%.",
  confidence: "high",
};

const CONTEXT: FixtureContext = {
  fixtureId: 18179759,
  participant1: "Home",
  participant2: "Away",
  currentScore: "1-0",
  gamePhase: "1st Half",
  statLabel: "P1 goals",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const env = loadEnv();
  const heraldCfg = loadHeraldConfig();
  const alerter = createHeraldAlerter(heraldCfg, networkConfig(env.network));

  // Fresh proof timestamp each run → fresh idempotency key → a real new send
  // (not deduped as a duplicate), so this is a repeatable end-to-end check.
  const signal = { ...SIGNAL, evidence: { ...SIGNAL.evidence, provenAt: new Date().toISOString() } };

  console.log(`[alert] sending to Herald wallet ${heraldCfg.recipientWallet} (Telegram preferred)…`);
  const res = await alerter.send(signal, EXPLANATION, CONTEXT);
  console.log("[alert] result:", JSON.stringify(res, null, 2));
  if (res.status !== "queued") {
    console.log(`[alert] status=${res.status} (registered=${res.recipientRegistered}) — not delivered.`);
    return;
  }

  // Herald resolves routing + delivery async; poll a few times to confirm.
  console.log("[alert] polling delivery status…");
  for (let i = 0; i < 8; i++) {
    await sleep(2_000);
    const s = await alerter.status(res.notificationId);
    console.log(`[alert]   status=${s.status} channel=${s.deliveryChannel ?? "?"} deliveredAt=${s.deliveredAt ?? "-"}`);
    if (s.deliveredAt || ["delivered", "failed", "bounced"].includes(s.status)) {
      console.log(
        s.deliveredAt
          ? `[alert] ✅ delivered via ${s.deliveryChannel ?? "?"} — the recipient's phone just buzzed.`
          : `[alert] final status=${s.status}.`
      );
      return;
    }
  }
  console.log("[alert] still in flight after polling — check the recipient's Telegram / notification dashboard.");
}

main().catch((err) => {
  console.error("[alert] fatal:", err?.message ?? err);
  process.exit(1);
});
