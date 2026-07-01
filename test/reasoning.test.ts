import { describe, it, expect, vi } from "vitest";
import type { DivergenceSignal, FixtureContext } from "../src/types";
import { gamePhaseLabel, statKeyLabel } from "../src/gamePhase";
import {
  parseSignalExplanation,
  assertWithinBoundary,
  ExplanationError,
} from "../src/reasoning/parse";
import { buildExplainUserPayload } from "../src/reasoning/prompt";
import { explainSignal } from "../src/reasoning/explain";
import type { LlmPort } from "../src/reasoning/llm";

const SIGNAL: DivergenceSignal = {
  type: "LAGGING_MARKET",
  fixtureId: 111,
  statKey: 1,
  windowMs: 10_000,
  detectedAt: "2026-07-01T12:00:10.000Z",
  evidence: {
    fixtureId: 111,
    statKey: 1,
    provenAt: "2026-07-01T12:00:00.000Z",
    txSlot: 987_654,
    txSignature: "SIG123",
    scoreEventReceivedAt: "2026-07-01T11:59:58.000Z",
    latencyMs: 14_000,
  },
  observed: {
    maxObservedShift: 0.012,
    postTickCount: 4,
    series: [
      {
        market: "1X2:FT",
        selection: "Home",
        bookmakerId: 10,
        baselineProbability: 0.5,
        maxShift: 0.012,
        postTickCount: 4,
      },
    ],
  },
};

const CONTEXT: FixtureContext = {
  fixtureId: 111,
  participant1: "Home FC",
  participant2: "Away FC",
  currentScore: "1-0",
  gamePhase: "2nd Half",
  statLabel: "P1 goals",
};

describe("gamePhase / statKey labels", () => {
  it("maps known game states and passes unknown through", () => {
    expect(gamePhaseLabel("2H")).toBe("2nd Half");
    expect(gamePhaseLabel("ht")).toBe("Halftime");
    expect(gamePhaseLabel("WAT")).toBe("WAT");
    expect(gamePhaseLabel("")).toBe("Unknown");
  });

  it("labels goal stat keys with period", () => {
    expect(statKeyLabel(1)).toBe("P1 goals");
    expect(statKeyLabel(2001)).toBe("P1 goals (2nd Half)"); // H2 offset 2000 + base 1
    expect(statKeyLabel(2002)).toBe("P2 goals (2nd Half)"); // H2 offset 2000 + base 2
    expect(statKeyLabel(7)).toBe("P1 corners");
  });
});

describe("parseSignalExplanation", () => {
  it("parses a clean JSON object", () => {
    expect(
      parseSignalExplanation('{"explanation":"The market held flat.","confidence":"high"}')
    ).toEqual({ explanation: "The market held flat.", confidence: "high" });
  });

  it("tolerates a ```json code fence and whitespace", () => {
    const raw = '```json\n{"explanation":"Odds unchanged.","confidence":"medium"}\n```';
    expect(parseSignalExplanation(raw)).toEqual({
      explanation: "Odds unchanged.",
      confidence: "medium",
    });
  });

  it("throws on non-JSON, non-object, missing/empty explanation, bad confidence", () => {
    expect(() => parseSignalExplanation("not json")).toThrow(ExplanationError);
    expect(() => parseSignalExplanation("[1,2,3]")).toThrow(ExplanationError);
    expect(() => parseSignalExplanation('{"confidence":"high"}')).toThrow(/explanation/);
    expect(() => parseSignalExplanation('{"explanation":"  ","confidence":"high"}')).toThrow(
      /explanation/
    );
    expect(() =>
      parseSignalExplanation('{"explanation":"ok","confidence":"certain"}')
    ).toThrow(/confidence/);
  });
});

describe("assertWithinBoundary (defence-in-depth)", () => {
  it("accepts a clean structural statement", () => {
    expect(() =>
      assertWithinBoundary({
        explanation:
          "Home FC's proven 2nd-half goal landed on-chain, but the match-winner odds have not moved in the 10s since.",
        confidence: "high",
      })
    ).not.toThrow();
  });

  it("rejects trade-advice and market-judgement phrasing", () => {
    for (const bad of [
      "This looks like value on the Home win.",
      "You should back the home team now.",
      "The market is mispriced after the goal.",
      "Consider a position on the next goal market.",
      "There's an edge here before odds adjust.",
    ]) {
      expect(() => assertWithinBoundary({ explanation: bad, confidence: "high" })).toThrow(
        ExplanationError
      );
    }
  });
});

describe("buildExplainUserPayload", () => {
  it("includes only allowed fields and no raw bookmaker/series data", () => {
    const payload = JSON.parse(buildExplainUserPayload(SIGNAL, CONTEXT));
    expect(payload.fixture).toMatchObject({
      participant1: "Home FC",
      participant2: "Away FC",
      currentScore: "1-0",
      gamePhase: "2nd Half",
    });
    expect(payload.provenStat).toMatchObject({ label: "P1 goals", proofLatencyMs: 14_000 });
    expect(payload.marketResponse).toMatchObject({
      windowMs: 10_000,
      oddsTicksObservedInWindow: 4,
      largestProbabilityShift: 0.012,
    });
    // Raw per-bookmaker series must not leak into the prompt.
    expect(JSON.stringify(payload)).not.toContain("bookmakerId");
  });
});

describe("explainSignal", () => {
  const port = (text: string): LlmPort => ({ complete: vi.fn().mockResolvedValue(text) });

  it("returns a structured, boundary-safe explanation on good output", async () => {
    const p = port(
      '{"explanation":"Home FC\'s 2nd-half goal is proven on-chain, but the match-winner odds have not moved in the 10 seconds since.","confidence":"high"}'
    );
    const out = await explainSignal(SIGNAL, CONTEXT, p);
    expect(out.confidence).toBe("high");
    expect(out.explanation).toMatch(/proven on-chain/);
    expect(p.complete).toHaveBeenCalledOnce();
  });

  it("throws ExplanationError on malformed model output", async () => {
    await expect(explainSignal(SIGNAL, CONTEXT, port("sorry, I can't do that"))).rejects.toThrow(
      ExplanationError
    );
  });

  it("ADVERSARIAL: a model that emits a trade recommendation is caught by the boundary", async () => {
    // Even if the model ignores the system prompt and returns valid JSON that
    // recommends a bet, explainSignal must refuse it — the claim never reaches a user.
    const rogue = port(
      '{"explanation":"Back Home FC now — the odds are mispriced after the goal.","confidence":"high"}'
    );
    await expect(explainSignal(SIGNAL, CONTEXT, rogue)).rejects.toThrow(/boundary/);
  });
});
