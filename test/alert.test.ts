import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DivergenceSignal, FixtureContext, SignalExplanation } from "../src/types";
import type { NetworkConfig } from "txline-anchor";
import { formatAlert } from "../src/alert/format";

// Mock the Herald SDK so createHeraldAlerter is testable without a network.
const notifyMock = vi.fn();
vi.mock("@herald-protocol/sdk", () => ({
  Herald: vi.fn().mockImplementation(() => ({ notify: notifyMock })),
}));
// Import AFTER the mock is registered.
import { createHeraldAlerter } from "../src/alert/herald";
import type { HeraldConfig } from "../src/env";

const NETWORK = { explorerCluster: "?cluster=devnet" } as NetworkConfig;

const SIGNAL: DivergenceSignal = {
  type: "LAGGING_MARKET",
  fixtureId: 111,
  statKey: 1,
  windowMs: 20_000,
  detectedAt: "2026-07-01T12:00:20.000Z",
  evidence: {
    fixtureId: 111,
    statKey: 1,
    provenAt: "2026-07-01T12:00:00.000Z",
    txSignature: "SIG123",
    scoreEventReceivedAt: "2026-07-01T11:59:46.000Z",
    latencyMs: 14_000,
  },
  observed: { maxObservedShift: 0.012, postTickCount: 4, series: [] },
};

const EXPLANATION: SignalExplanation = {
  explanation: "Home FC's goal is proven on-chain, but the match-winner odds haven't moved in 20s.",
  confidence: "high",
};

const CONTEXT: FixtureContext = {
  fixtureId: 111,
  participant1: "Home FC",
  participant2: "Away FC",
  currentScore: "1-0",
  gamePhase: "2nd Half",
  statLabel: "P1 goals",
};

describe("formatAlert", () => {
  it("leads with the explanation and includes checkable evidence + explorer link", () => {
    const { subject, body } = formatAlert(SIGNAL, EXPLANATION, CONTEXT, NETWORK);
    expect(subject).toContain("Home FC vs Away FC");
    expect(subject.length).toBeLessThanOrEqual(150);
    expect(body).toContain(EXPLANATION.explanation);
    expect(body).toContain("P1 goals");
    expect(body).toContain("14.0s"); // proof round-trip
    expect(body).toContain("https://explorer.solana.com/tx/SIG123?cluster=devnet");
    expect(body).toContain("Not trading advice");
  });

  it("clamps an over-long subject to 150 chars", () => {
    const longCtx = { ...CONTEXT, participant1: "A".repeat(200) };
    expect(formatAlert(SIGNAL, EXPLANATION, longCtx, NETWORK).subject.length).toBeLessThanOrEqual(150);
  });

  it("omits the proof link when no tx was landed (check-only proof)", () => {
    const noTx = { ...SIGNAL, evidence: { ...SIGNAL.evidence, txSignature: undefined } };
    expect(formatAlert(noTx, EXPLANATION, CONTEXT, NETWORK).body).not.toContain("Verify the on-chain proof");
  });
});

describe("createHeraldAlerter", () => {
  const cfg: HeraldConfig = {
    apiKey: "hrld_live_test",
    recipientWallet: "WALLET123",
    receipt: false,
    priority: "important",
    category: "defi",
  };

  beforeEach(() => notifyMock.mockReset());

  it("sends via Herald with Telegram preferred and maps the result", async () => {
    notifyMock.mockResolvedValue({
      notificationId: "notif-1",
      status: "queued",
      deliveryChannel: "telegram",
      recipientRegistered: true,
    });
    const alerter = createHeraldAlerter(cfg, NETWORK);
    const res = await alerter.send(SIGNAL, EXPLANATION, CONTEXT);

    expect(notifyMock).toHaveBeenCalledOnce();
    const params = notifyMock.mock.calls[0]![0];
    expect(params).toMatchObject({
      wallet: "WALLET123",
      preferredChannel: "telegram",
      priority: "important",
      category: "defi",
      receipt: false,
    });
    expect(params.subject).toContain("Home FC vs Away FC");
    expect(params.idempotencyKey).toContain("sidefoot_111_1_");
    expect(res).toEqual({
      notificationId: "notif-1",
      status: "queued",
      deliveryChannel: "telegram",
      recipientRegistered: true,
    });
  });
});
