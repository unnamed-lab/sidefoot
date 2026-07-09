import { describe, it, expect, vi } from "vitest";
import type { OddsTick, ScoreEvent, SignalExplanation } from "../src/types";
import type { ProofResult } from "../src/prover";
import type { AlertResult } from "../src/alert/herald";
import {
  SidefootPipeline,
  type PipelineDeps,
  type PipelineEvent,
  type Scheduler,
} from "../src/pipeline";

const T0 = Date.parse("2026-07-01T12:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

/** Collects scheduled jobs so the test fires them deterministically. */
class ManualScheduler implements Scheduler {
  jobs: Array<() => void | Promise<void>> = [];
  schedule(fn: () => void | Promise<void>): void {
    this.jobs.push(fn);
  }
  async runAll(): Promise<void> {
    const jobs = this.jobs;
    this.jobs = [];
    for (const fn of jobs) await fn();
  }
}

function goal(over: Partial<ScoreEvent> = {}): ScoreEvent {
  return { fixtureId: 111, seq: 42, statKey: 1, value: 1, gameState: "2H", receivedAt: at(-1_000), ...over };
}

function tick(offsetMs: number, prob: number): OddsTick {
  return {
    fixtureId: 111,
    market: "1X2",
    selection: "Home",
    impliedProbability: prob,
    receivedAt: at(offsetMs),
    bookmakerId: 10,
    messageId: `m${offsetMs}`,
  };
}

function verifiedProof(over: Partial<ProofResult> = {}): ProofResult {
  return {
    verified: true,
    predicateResult: true,
    predicate: { threshold: 0, comparison: { greaterThan: {} } },
    event: goal(),
    provenAt: at(0),
    latencyMs: 14_000,
    signature: "SIG",
    txSlot: 1,
    signal: {
      fixtureId: 111,
      statKey: 1,
      provenAt: at(0),
      txSignature: "SIG",
      scoreEventReceivedAt: at(-1_000),
      latencyMs: 14_000,
    },
    ...over,
  };
}

const EXPLANATION: SignalExplanation = { explanation: "Odds haven't moved.", confidence: "high" };
const ALERT_RESULT: AlertResult = {
  notificationId: "n1",
  status: "queued",
  deliveryChannel: "telegram",
  recipientRegistered: true,
};

interface Harness {
  pipeline: SidefootPipeline;
  scheduler: ManualScheduler;
  prove: ReturnType<typeof vi.fn>;
  explain: ReturnType<typeof vi.fn>;
  alert: ReturnType<typeof vi.fn>;
  events: PipelineEvent[];
}

function harness(over: Partial<PipelineDeps> = {}): Harness {
  const scheduler = new ManualScheduler();
  const events: PipelineEvent[] = [];
  const prove = vi.fn().mockResolvedValue(verifiedProof());
  const explain = vi.fn().mockResolvedValue(EXPLANATION);
  const alert = vi.fn().mockResolvedValue(ALERT_RESULT);
  const pipeline = new SidefootPipeline({
    prove,
    explain,
    alert,
    resolveTeams: () => ({ participant1: "Home FC", participant2: "Away FC" }),
    config: { expectedMoveWindowMs: 20_000, minProbabilityShift: 0.03 },
    scheduler,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { pipeline, scheduler, prove, explain, alert, events };
}

describe("SidefootPipeline", () => {
  it("proves a goal, waits the window, detects lag, explains, and alerts", async () => {
    const h = harness();
    h.pipeline.onOddsTick(tick(-2_000, 0.5)); // baseline (pre-proof)
    h.pipeline.onOddsTick(tick(3_000, 0.51)); // in-window, flat → lag

    await h.pipeline.onScoreEvent(goal());
    expect(h.prove).toHaveBeenCalledOnce();
    expect(h.alert).not.toHaveBeenCalled(); // deferred until the window closes

    await h.scheduler.runAll();
    expect(h.explain).toHaveBeenCalledOnce();
    expect(h.alert).toHaveBeenCalledOnce();

    const kinds = h.events.map((e) => e.kind);
    expect(kinds).toContain("proof");
    expect(kinds).toContain("verdict");
    expect(kinds).toContain("signal");
    expect(kinds).toContain("alert");
  });

  it("does not prove non-goal stats", async () => {
    const h = harness();
    await h.pipeline.onScoreEvent(goal({ statKey: 7 })); // corners
    expect(h.prove).not.toHaveBeenCalled();
    expect(h.scheduler.jobs).toHaveLength(0);
  });

  it("does not alert when the proof is authentic but the predicate is false", async () => {
    const h = harness({ prove: vi.fn().mockResolvedValue(verifiedProof({ verified: false, predicateResult: false, signal: null })) as any });
    await h.pipeline.onScoreEvent(goal());
    expect(h.scheduler.jobs).toHaveLength(0); // no evaluation scheduled
    await h.scheduler.runAll();
    expect(h.alert).not.toHaveBeenCalled();
  });

  it("does not alert when the market moved within the window", async () => {
    const h = harness();
    h.pipeline.onOddsTick(tick(-2_000, 0.5));
    h.pipeline.onOddsTick(tick(3_000, 0.62)); // +0.12 shift ≥ 0.03 → market moved
    await h.pipeline.onScoreEvent(goal());
    await h.scheduler.runAll();
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.events.find((e) => e.kind === "verdict")).toMatchObject({ verdict: { status: "MARKET_MOVED" } });
  });

  it("proves each (fixture,seq,stat) only once", async () => {
    const h = harness();
    await h.pipeline.onScoreEvent(goal());
    await h.pipeline.onScoreEvent(goal()); // duplicate
    expect(h.prove).toHaveBeenCalledOnce();
  });

  it("retries a 404 proof as 'pending' (not an error) and honours backoff", async () => {
    const err = Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } });
    const prove = vi.fn().mockRejectedValue(err);
    const h = harness({ prove: prove as unknown as PipelineDeps["prove"] });

    await h.pipeline.onScoreEvent(goal());
    expect(prove).toHaveBeenCalledOnce();
    expect(h.events.find((e) => e.kind === "pending")).toMatchObject({ kind: "pending", reason: "not-published" });
    expect(h.events.some((e) => e.kind === "error")).toBe(false);

    // The same goal arriving again (new seq) must NOT re-attempt during backoff.
    await h.pipeline.onScoreEvent(goal({ seq: 99 }));
    expect(prove).toHaveBeenCalledOnce();
  });

  it("emits a hard error once proof retries are exhausted", async () => {
    const err = Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } });
    const prove = vi.fn().mockRejectedValue(err);
    const h = harness({ prove: prove as unknown as PipelineDeps["prove"], proofRetry: { maxAttempts: 1 } });

    await h.pipeline.onScoreEvent(goal());
    expect(h.events.find((e) => e.kind === "error")).toMatchObject({ stage: "prove" });
    expect(h.events.some((e) => e.kind === "pending")).toBe(false);
  });

  it("drops the alert if the explanation fails the boundary/parse", async () => {
    const h = harness({ explain: vi.fn().mockRejectedValue(new Error("boundary breach")) as any });
    h.pipeline.onOddsTick(tick(-2_000, 0.5));
    h.pipeline.onOddsTick(tick(3_000, 0.51));
    await h.pipeline.onScoreEvent(goal());
    await h.scheduler.runAll();
    expect(h.alert).not.toHaveBeenCalled();
    expect(h.events.find((e) => e.kind === "error")).toMatchObject({ stage: "explain" });
  });
});
