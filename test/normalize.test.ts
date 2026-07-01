import { describe, it, expect } from "vitest";
import type { OddsPayload, Scores } from "txline-anchor";
import { normalizeOdds, normalizeScores, parsePct } from "../src/normalize";

const AT = "2026-07-01T12:00:00.000Z";

function oddsFixture(over: Partial<OddsPayload> = {}): OddsPayload {
  return {
    FixtureId: 111,
    MessageId: "msg-1",
    Ts: 1_700_000_000,
    Bookmaker: "Acme",
    BookmakerId: 7,
    SuperOddsType: "1X2",
    InRunning: true,
    MarketPeriod: "FT",
    PriceNames: ["Home", "Draw", "Away"],
    Prices: [1.9, 3.4, 4.2],
    Pct: ["52.381", "29.000", "18.619"],
    ...over,
  };
}

describe("parsePct", () => {
  it("converts a percentage string to a probability", () => {
    expect(parsePct("52.381")).toBeCloseTo(0.52381, 5);
  });
  it("returns undefined for NA / blank / junk", () => {
    expect(parsePct("NA")).toBeUndefined();
    expect(parsePct(undefined)).toBeUndefined();
    expect(parsePct("")).toBeUndefined();
    expect(parsePct("-1")).toBeUndefined();
  });
});

describe("normalizeOdds", () => {
  it("flattens one message into one tick per selection", () => {
    const ticks = normalizeOdds(oddsFixture(), AT);
    expect(ticks).toHaveLength(3);
    expect(ticks.map((t) => t.selection)).toEqual(["Home", "Draw", "Away"]);
    expect(ticks[0]).toMatchObject({
      fixtureId: 111,
      market: "1X2:FT",
      selection: "Home",
      bookmakerId: 7,
      messageId: "msg-1",
      receivedAt: AT,
    });
    expect(ticks[0]!.impliedProbability).toBeCloseTo(0.52381, 5);
    expect(ticks[0]!.decimalOdds).toBe(1.9);
  });

  it("prefers demargined Pct but falls back to 1/price when Pct is NA", () => {
    const ticks = normalizeOdds(
      oddsFixture({ Pct: ["NA", "NA", "NA"] }),
      AT
    );
    expect(ticks[0]!.impliedProbability).toBeCloseTo(1 / 1.9, 6);
  });

  it("drops selections with neither a usable Pct nor a positive price", () => {
    const ticks = normalizeOdds(
      oddsFixture({ Prices: [0, 3.4, 4.2], Pct: ["NA", "29.000", "18.619"] }),
      AT
    );
    expect(ticks.map((t) => t.selection)).toEqual(["Draw", "Away"]);
  });

  it("returns nothing when the message carries no selections", () => {
    expect(normalizeOdds(oddsFixture({ PriceNames: [], Prices: [], Pct: [] }), AT)).toEqual([]);
  });

  it("folds market period and parameters into the descriptor", () => {
    const ticks = normalizeOdds(
      oddsFixture({ SuperOddsType: "OU", MarketPeriod: "FT", MarketParameters: "2.5" }),
      AT
    );
    expect(ticks[0]!.market).toBe("OU:FT:2.5");
  });
});

function scoresFixture(over: Partial<Scores> = {}): Scores {
  return {
    FixtureId: 222,
    GameState: "2H",
    StartTime: 0,
    IsTeam: true,
    FixtureGroupId: 0,
    CompetitionId: 0,
    CountryId: 0,
    SportId: 1,
    Participant1IsHome: true,
    Participant2Id: 2,
    Participant1Id: 1,
    Action: "Update",
    Id: 1,
    Ts: 1_700_000_000,
    ConnectionId: 0,
    Seq: 42,
    Stats: { "1": 2, "7": 5 },
    ...over,
  };
}

describe("normalizeScores", () => {
  it("expands the Stats map into one event per stat key", () => {
    const events = normalizeScores(scoresFixture(), AT);
    expect(events).toHaveLength(2);
    expect(events).toContainEqual({
      fixtureId: 222,
      seq: 42,
      statKey: 1,
      value: 2,
      gameState: "2H",
      receivedAt: AT,
    });
    expect(events.find((e) => e.statKey === 7)!.value).toBe(5);
  });

  it("returns nothing for a record with no Stats", () => {
    expect(normalizeScores(scoresFixture({ Stats: undefined }), AT)).toEqual([]);
    expect(normalizeScores(scoresFixture({ Stats: {} }), AT)).toEqual([]);
  });

  it("defaults an absent GameState to empty string", () => {
    const [ev] = normalizeScores(scoresFixture({ GameState: undefined as unknown as string }), AT);
    expect(ev!.gameState).toBe("");
  });
});
