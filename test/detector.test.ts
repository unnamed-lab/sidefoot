import { describe, it, expect } from "vitest";
import type { OddsTick, VerifiedSignal } from "../src/types";
import {
  detectLaggingMarket,
  evaluateLaggingMarket,
  type LaggingMarketConfig,
} from "../src/detector";

// Proof lands at T0; tick times are expressed as ms offsets from it.
const T0 = Date.parse("2026-07-01T12:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

const CONFIG: LaggingMarketConfig = {
  expectedMoveWindowMs: 10_000,
  minProbabilityShift: 0.05,
};

function proof(over: Partial<VerifiedSignal> = {}): VerifiedSignal {
  return {
    fixtureId: 111,
    statKey: 1,
    provenAt: at(0),
    scoreEventReceivedAt: at(-1_500),
    latencyMs: 1_500,
    ...over,
  };
}

function tick(
  offsetMs: number,
  impliedProbability: number,
  over: Partial<OddsTick> = {}
): OddsTick {
  return {
    fixtureId: 111,
    market: "1X2:FT",
    selection: "Home",
    impliedProbability,
    receivedAt: at(offsetMs),
    bookmakerId: 10,
    messageId: `m${offsetMs}`,
    ...over,
  };
}

describe("detectLaggingMarket", () => {
  it("fires when a live market fails to move after a proven stat", () => {
    const ticks = [
      tick(-2_000, 0.50), // baseline (pre-proof)
      tick(2_000, 0.505), // post-proof, barely moves
      tick(6_000, 0.51), // still < 0.05 shift
    ];
    const signal = detectLaggingMarket(proof(), ticks, CONFIG);
    expect(signal).not.toBeNull();
    expect(signal!).toMatchObject({
      type: "LAGGING_MARKET",
      fixtureId: 111,
      statKey: 1,
      windowMs: 10_000,
    });
    // detectedAt is when the window closes: provenAt + windowMs.
    expect(signal!.detectedAt).toBe(at(10_000));
    // Evidence carries the on-chain proof and the odds-side observation.
    expect(signal!.evidence.latencyMs).toBe(1_500);
    expect(signal!.observed.postTickCount).toBe(2);
    expect(signal!.observed.maxObservedShift).toBeCloseTo(0.01, 6);
    expect(signal!.observed.series[0]).toMatchObject({
      market: "1X2:FT",
      selection: "Home",
      bookmakerId: 10,
      baselineProbability: 0.5,
    });
  });

  it("does NOT fire when the market moves by >= the threshold (no-signal)", () => {
    const ticks = [
      tick(-2_000, 0.5),
      tick(3_000, 0.58), // +0.08 shift >= 0.05
    ];
    expect(detectLaggingMarket(proof(), ticks, CONFIG)).toBeNull();
    expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe("MARKET_MOVED");
  });

  it("treats a shift exactly at the threshold as movement (>= boundary)", () => {
    const ticks = [tick(-1_000, 0.5), tick(2_000, 0.55)]; // exactly +0.05
    expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe("MARKET_MOVED");
  });

  it("fires for a shift just below the threshold", () => {
    const ticks = [tick(-1_000, 0.5), tick(2_000, 0.5499)]; // +0.0499 < 0.05
    expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe("LAGGING_MARKET");
  });

  describe("window boundaries", () => {
    it("counts a tick landing exactly at the window end", () => {
      const ticks = [tick(-1_000, 0.5), tick(10_000, 0.5)]; // at windowEnd, flat
      const v = evaluateLaggingMarket(proof(), ticks, CONFIG);
      expect(v.status).toBe("LAGGING_MARKET");
      expect(v.postTickCount).toBe(1);
    });

    it("ignores a tick just past the window end (that's a gap, not a lag)", () => {
      const ticks = [tick(-1_000, 0.5), tick(10_001, 0.5)]; // past window
      const v = evaluateLaggingMarket(proof(), ticks, CONFIG);
      expect(v.status).toBe("INSUFFICIENT_DATA");
      expect(v.postTickCount).toBe(0);
    });

    it("ignores a tick exactly at provenAt as baseline, not post", () => {
      const ticks = [tick(0, 0.5)]; // only a tick at the proof instant
      expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe(
        "INSUFFICIENT_DATA"
      );
    });
  });

  describe("insufficient data vs lag", () => {
    it("returns INSUFFICIENT_DATA when there are no post-proof ticks (feed gap)", () => {
      const ticks = [tick(-3_000, 0.5), tick(-1_000, 0.5)]; // only pre-proof
      expect(detectLaggingMarket(proof(), ticks, CONFIG)).toBeNull();
      expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe(
        "INSUFFICIENT_DATA"
      );
    });

    it("skips a series with no baseline (market only appears after the proof)", () => {
      const ticks = [tick(2_000, 0.5), tick(5_000, 0.9)]; // no pre-proof tick
      const v = evaluateLaggingMarket(proof(), ticks, CONFIG);
      expect(v.status).toBe("INSUFFICIENT_DATA");
      expect(v.series).toHaveLength(0);
    });
  });

  it("uses the latest pre-proof tick as the baseline", () => {
    const ticks = [
      tick(-8_000, 0.40),
      tick(-1_000, 0.50), // latest pre-proof → baseline
      tick(3_000, 0.53), // +0.03 from 0.50, not +0.13 from 0.40
    ];
    const v = evaluateLaggingMarket(proof(), ticks, CONFIG);
    expect(v.series[0]!.baselineProbability).toBe(0.5);
    expect(v.status).toBe("LAGGING_MARKET");
  });

  describe("multiple simultaneous fixtures", () => {
    it("ignores ticks from other fixtures when judging the proof's fixture", () => {
      const ticks = [
        tick(-1_000, 0.5), // fixture 111 baseline
        tick(3_000, 0.51), // fixture 111 flat → lag
        tick(-1_000, 0.5, { fixtureId: 999 }),
        tick(3_000, 0.9, { fixtureId: 999 }), // another fixture moved a lot
      ];
      const signal = detectLaggingMarket(proof({ fixtureId: 111 }), ticks, CONFIG);
      expect(signal).not.toBeNull();
      expect(signal!.fixtureId).toBe(111);
      // The other fixture's big move must not leak into the observation.
      expect(signal!.observed.maxObservedShift).toBeCloseTo(0.01, 6);
    });
  });

  describe("per-bookmaker series", () => {
    it("counts movement on ANY bookmaker's series as the market moving", () => {
      const ticks = [
        tick(-1_000, 0.5, { bookmakerId: 10 }),
        tick(3_000, 0.51, { bookmakerId: 10 }), // bk10 flat
        tick(-1_000, 0.5, { bookmakerId: 20 }),
        tick(3_000, 0.62, { bookmakerId: 20 }), // bk20 moved +0.12
      ];
      expect(detectLaggingMarket(proof(), ticks, CONFIG)).toBeNull();
      expect(evaluateLaggingMarket(proof(), ticks, CONFIG).status).toBe(
        "MARKET_MOVED"
      );
    });

    it("keeps separate baselines per market/selection/bookmaker", () => {
      const ticks = [
        tick(-1_000, 0.5, { selection: "Home" }),
        tick(-1_000, 0.3, { selection: "Away" }),
        tick(3_000, 0.51, { selection: "Home" }),
        tick(3_000, 0.31, { selection: "Away" }),
      ];
      const v = evaluateLaggingMarket(proof(), ticks, CONFIG);
      expect(v.status).toBe("LAGGING_MARKET");
      expect(v.series).toHaveLength(2);
      expect(v.postTickCount).toBe(2);
    });
  });
});
