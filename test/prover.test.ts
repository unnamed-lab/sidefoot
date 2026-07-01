import { describe, it, expect, vi } from "vitest";
import type { ScoreEvent } from "../src/types";
import type { ScoresStatValidation } from "txline-anchor";
import {
  proveScoreEvent,
  goalIncreasedPredicate,
  isGoalStat,
  isProofWorthy,
  type ProverPorts,
  type ProverDeps,
} from "../src/prover";

const EVENT: ScoreEvent = {
  fixtureId: 111,
  seq: 42,
  statKey: 1, // P1 goals, full game
  value: 2,
  gameState: "2H",
  receivedAt: "2026-07-01T12:00:00.000Z",
};

// A minimal legacy validation object; the fake ports never inspect it.
const VALIDATION = { statToProve: { key: 1, value: 2, period: 0 } } as unknown as ScoresStatValidation;

// deps are opaque to the fake ports.
const DEPS = { program: {} as ProverDeps["program"], client: {} as ProverDeps["client"] };

function ports(over: Partial<ProverPorts> = {}): ProverPorts {
  return {
    getStatValidation: vi.fn().mockResolvedValue(VALIDATION),
    checkStatOnChain: vi.fn().mockResolvedValue(true),
    validateStatOnChain: vi
      .fn()
      .mockResolvedValue({ signature: "SIG123", predicateResult: true, dailyScoresPda: {} }),
    getSlot: vi.fn().mockResolvedValue(987_654),
    ...over,
  };
}

describe("predicate + worthiness helpers", () => {
  it("goalIncreasedPredicate proves value > value-1", () => {
    expect(goalIncreasedPredicate({ ...EVENT, value: 2 })).toEqual({
      threshold: 1,
      comparison: { greaterThan: {} },
    });
    // First goal: value 1 → threshold 0 (never negative).
    expect(goalIncreasedPredicate({ ...EVENT, value: 1 }).threshold).toBe(0);
  });

  it("recognises goal stats and gates worthiness", () => {
    expect(isGoalStat(1)).toBe(true); // P1 goals
    expect(isGoalStat(2)).toBe(true); // P2 goals
    expect(isGoalStat(7)).toBe(false); // corners
    expect(isProofWorthy(EVENT)).toBe(true);
    expect(isProofWorthy({ ...EVENT, statKey: 7 })).toBe(false); // corners
    expect(isProofWorthy({ ...EVENT, value: 0 })).toBe(false); // no goal yet
  });
});

describe("proveScoreEvent", () => {
  it("record mode: lands a proof and emits a VerifiedSignal with tx + slot", async () => {
    const p = ports();
    const res = await proveScoreEvent(DEPS, EVENT, { record: true }, p);

    expect(p.validateStatOnChain).toHaveBeenCalledOnce();
    expect(p.checkStatOnChain).not.toHaveBeenCalled();
    expect(res.verified).toBe(true);
    expect(res.signal).not.toBeNull();
    expect(res.signal).toMatchObject({
      fixtureId: 111,
      statKey: 1,
      txSignature: "SIG123",
      txSlot: 987_654,
      scoreEventReceivedAt: EVENT.receivedAt,
    });
    expect(res.signal!.provenAt).toMatch(/T.*Z$/);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("requests the stat proof for the event's fixture/seq/statKey", async () => {
    const p = ports();
    await proveScoreEvent(DEPS, EVENT, { record: true }, p);
    expect(p.getStatValidation).toHaveBeenCalledWith(DEPS.client, {
      fixtureId: 111,
      seq: 42,
      statKey: 1,
    });
  });

  it("passes the default goal-increased predicate to the chain", async () => {
    const p = ports();
    await proveScoreEvent(DEPS, EVENT, { record: true }, p);
    expect(p.validateStatOnChain).toHaveBeenCalledWith(DEPS.program, VALIDATION, {
      threshold: 1,
      comparison: { greaterThan: {} },
    });
  });

  it("honours a caller-supplied predicate override", async () => {
    const p = ports();
    const predicate = { threshold: 5, comparison: { lessThan: {} as Record<string, never> } };
    await proveScoreEvent(DEPS, EVENT, { record: true, predicate }, p);
    expect(p.validateStatOnChain).toHaveBeenCalledWith(DEPS.program, VALIDATION, predicate);
  });

  it("check mode: simulates only, no tx, no signature/slot on the signal", async () => {
    const p = ports();
    const res = await proveScoreEvent(DEPS, EVENT, { record: false }, p);
    expect(p.checkStatOnChain).toHaveBeenCalledOnce();
    expect(p.validateStatOnChain).not.toHaveBeenCalled();
    expect(p.getSlot).not.toHaveBeenCalled();
    expect(res.verified).toBe(true);
    expect(res.signal).toMatchObject({ fixtureId: 111, statKey: 1 });
    expect(res.signal!.txSignature).toBeUndefined();
    expect(res.signal!.txSlot).toBeUndefined();
  });

  it("authentic-but-predicate-false yields no signal (bool, not assert)", async () => {
    const p = ports({
      validateStatOnChain: vi
        .fn()
        .mockResolvedValue({ signature: "SIG0", predicateResult: false, dailyScoresPda: {} }),
    });
    const res = await proveScoreEvent(DEPS, EVENT, { record: true }, p);
    expect(res.verified).toBe(false);
    expect(res.predicateResult).toBe(false);
    expect(res.signal).toBeNull();
    // The authenticity tx still happened and is retained for the log.
    expect(res.signature).toBe("SIG0");
  });

  it("skips the slot lookup when fetchSlot is false", async () => {
    const p = ports();
    const res = await proveScoreEvent(DEPS, EVENT, { record: true, fetchSlot: false }, p);
    expect(p.getSlot).not.toHaveBeenCalled();
    expect(res.signal!.txSlot).toBeUndefined();
    expect(res.signal!.txSignature).toBe("SIG123");
  });

  it("throws a clear error if the API returns the V2 validation shape", async () => {
    const p = ports({
      getStatValidation: vi.fn().mockResolvedValue({ statsToProve: [] }),
    });
    await expect(proveScoreEvent(DEPS, EVENT, { record: false }, p)).rejects.toThrow(/V2/);
  });
});
