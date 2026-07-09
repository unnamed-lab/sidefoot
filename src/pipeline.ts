import type {
  OddsTick,
  ScoreEvent,
  DivergenceSignal,
  FixtureContext,
  SignalExplanation,
} from "./types";
import {
  detectLaggingMarket,
  evaluateLaggingMarket,
  type LaggingMarketConfig,
  type LaggingMarketVerdict,
} from "./detector";
import { isProofWorthy, classifyProofError, type ProofResult, type ProofErrorReason } from "./prover";
import { gamePhaseLabel, statKeyLabel } from "./gamePhase";
import type { AlertResult } from "./alert/herald";

/**
 * The imperative shell that ties the functional core together end to end:
 *
 *   odds/score ingest → prove (validate_stat) → wait the market's window →
 *   detect lag over proven-vs-odds → explain → alert (Herald/Telegram)
 *
 * Key timing choice: a stat's proof lands ~seconds after the score event
 * (the ~1.4M-CU round trip), and the market is then given `expectedMoveWindowMs`
 * to react. So a proven signal isn't judged immediately — evaluation is deferred
 * until the window closes, at which point the odds buffer holds both the
 * pre-proof baseline and the in-window ticks the detector needs.
 *
 * Everything with a side effect (proving, explaining, alerting, scheduling) is
 * an injected port, so the orchestration is unit-testable with fakes and a
 * manual scheduler — no network, cluster, or wall-clock.
 */

export interface Scheduler {
  /** Run `fn` after `ms`. The default uses setTimeout. */
  schedule(fn: () => void | Promise<void>, ms: number): void;
}

const realScheduler: Scheduler = {
  schedule: (fn, ms) => {
    const t = setTimeout(() => void Promise.resolve(fn()).catch(() => {}), ms);
    t.unref?.();
  },
};

/** Observability records — every meaningful step, confirmed or not (plan §6). */
export type PipelineEvent =
  | { kind: "proof"; at: string; event: ScoreEvent; result: ProofResult }
  | { kind: "pending"; at: string; event: ScoreEvent; reason: ProofErrorReason; attempts: number; nextRetryMs: number }
  | { kind: "verdict"; at: string; verdict: LaggingMarketVerdict }
  | { kind: "signal"; at: string; signal: DivergenceSignal; explanation: SignalExplanation }
  | { kind: "alert"; at: string; signal: DivergenceSignal; result: AlertResult }
  | { kind: "error"; at: string; stage: string; error: unknown };

export interface PipelineDeps {
  /** Prove a score event on-chain → ProofResult (wraps proveScoreEvent). */
  prove(event: ScoreEvent): Promise<ProofResult>;
  /** Turn a confirmed signal into one boundary-safe sentence. */
  explain(signal: DivergenceSignal, context: FixtureContext): Promise<SignalExplanation>;
  /** Deliver the alert (Herald → Telegram). */
  alert(
    signal: DivergenceSignal,
    explanation: SignalExplanation,
    context: FixtureContext
  ): Promise<AlertResult>;
  /** Resolve fixture team names for context; undefined ⇒ fallback labels. */
  resolveTeams?(fixtureId: number): { participant1: string; participant2: string } | undefined;
  config: LaggingMarketConfig;
  /**
   * Proof retry policy. A goal's Merkle validation is published in batches, so a
   * fresh goal 404s until its batch lands — we retry (not error) until then.
   */
  proofRetry?: {
    /** Give up after this many attempts per goal (default 40). */
    maxAttempts?: number;
    /** Backoff after a 404 "not published yet" (default 30_000ms). */
    pendingBackoffMs?: number;
    /** Backoff after a transient network error (default 10_000ms). */
    networkBackoffMs?: number;
  };
  /** Observability sink — receives every step. Default: no-op. */
  onEvent?(event: PipelineEvent): void;
  scheduler?: Scheduler;
  /** How long to retain odds ticks per fixture (baseline lookback + window). */
  bufferMs?: number;
  /** Grace added after the window before evaluating, to catch a trailing tick. */
  evalBufferMs?: number;
}

// Dedup by the goal's IDENTITY, not the score `seq` (which increments on every
// stat update). The same goal (fixture, stat, count) is one proof, retried —
// keying on `seq` would treat each update as a brand-new goal and hammer prove.
const goalKey = (e: { fixtureId: number; statKey: number; value: number }): string =>
  `${e.fixtureId}:${e.statKey}:${e.value}`;

const alertKey = (s: DivergenceSignal): string =>
  `${s.fixtureId}:${s.statKey}:${s.evidence.provenAt}`;

type ProofPhase = "inflight" | "pending" | "proven" | "failed";
interface ProofState {
  phase: ProofPhase;
  attempts: number;
  /** Earliest wall-clock ms at which the next retry may run. */
  nextAt: number;
}

export class SidefootPipeline {
  private readonly oddsBuffer = new Map<number, OddsTick[]>();
  private readonly lastEvent = new Map<number, ScoreEvent>();
  private readonly proofState = new Map<string, ProofState>();
  private readonly alerted = new Set<string>();

  private readonly scheduler: Scheduler;
  private readonly bufferMs: number;
  private readonly evalBufferMs: number;

  constructor(private readonly deps: PipelineDeps) {
    this.scheduler = deps.scheduler ?? realScheduler;
    // Default retention: the window plus a generous baseline lookback (the free
    // tier is 60s-delayed, so pre-proof ticks can be sparse).
    this.bufferMs = deps.bufferMs ?? deps.config.expectedMoveWindowMs + 120_000;
    this.evalBufferMs = deps.evalBufferMs ?? 2_000;
  }

  /** Handler for `startIngestion({ onOddsTick })`. */
  onOddsTick = (tick: OddsTick): void => {
    const arr = this.oddsBuffer.get(tick.fixtureId) ?? [];
    arr.push(tick);
    this.prune(arr, Date.parse(tick.receivedAt));
    this.oddsBuffer.set(tick.fixtureId, arr);
  };

  /** Handler for `startIngestion({ onScoreEvent })`. */
  onScoreEvent = async (event: ScoreEvent): Promise<void> => {
    this.lastEvent.set(event.fixtureId, event);
    if (!isProofWorthy(event)) return;

    const key = goalKey(event);
    const st = this.proofState.get(key);
    // Already settled or a proof is in flight → nothing to do.
    if (st && (st.phase === "proven" || st.phase === "failed" || st.phase === "inflight")) return;
    // Pending a retry: honour the backoff (the score stream fires far faster than
    // the validation batch publishes, so we don't attempt on every tick).
    if (st && Date.now() < st.nextAt) return;

    await this.attemptProof(key, event, st?.attempts ?? 0);
  };

  /** One proof attempt. On a retryable failure, schedules the next via backoff. */
  private async attemptProof(key: string, event: ScoreEvent, priorAttempts: number): Promise<void> {
    const attempts = priorAttempts + 1;
    this.proofState.set(key, { phase: "inflight", attempts, nextAt: 0 });

    let result: ProofResult;
    try {
      result = await this.deps.prove(event);
    } catch (err) {
      const { retryable, reason } = classifyProofError(err);
      const rc = this.deps.proofRetry ?? {};
      const maxAttempts = rc.maxAttempts ?? 40;
      if (retryable && attempts < maxAttempts) {
        const backoff = reason === "network" ? rc.networkBackoffMs ?? 10_000 : rc.pendingBackoffMs ?? 30_000;
        this.proofState.set(key, { phase: "pending", attempts, nextAt: Date.now() + backoff });
        this.emit({ kind: "pending", at: nowIso(), event, reason, attempts, nextRetryMs: backoff });
      } else {
        this.proofState.set(key, { phase: "failed", attempts, nextAt: Number.POSITIVE_INFINITY });
        this.emit({ kind: "error", at: nowIso(), stage: "prove", error: err });
      }
      return;
    }

    this.proofState.set(key, { phase: "proven", attempts, nextAt: Number.POSITIVE_INFINITY });
    this.emit({ kind: "proof", at: nowIso(), event, result });

    // A confirmed-authentic proof whose predicate held gives a VerifiedSignal.
    if (!result.verified || !result.signal) return;

    const proven = result.signal;
    // Defer judgement until the market has had its window to react.
    this.scheduler.schedule(
      () => this.evaluate(proven),
      this.deps.config.expectedMoveWindowMs + this.evalBufferMs
    );
  }

  private async evaluate(proven: ProofResult["signal"]): Promise<void> {
    if (!proven) return;
    const ticks = this.oddsBuffer.get(proven.fixtureId) ?? [];

    const verdict = evaluateLaggingMarket(proven, ticks, this.deps.config);
    this.emit({ kind: "verdict", at: nowIso(), verdict });

    const signal = detectLaggingMarket(proven, ticks, this.deps.config);
    if (!signal) return; // MARKET_MOVED or INSUFFICIENT_DATA — no alert

    const key = alertKey(signal);
    if (this.alerted.has(key)) return;
    this.alerted.add(key);

    const context = this.buildContext(signal);

    let explanation: SignalExplanation;
    try {
      explanation = await this.deps.explain(signal, context);
    } catch (err) {
      // A malformed / boundary-breaching explanation must never reach a user.
      this.emit({ kind: "error", at: nowIso(), stage: "explain", error: err });
      return;
    }
    this.emit({ kind: "signal", at: nowIso(), signal, explanation });

    try {
      const result = await this.deps.alert(signal, explanation, context);
      this.emit({ kind: "alert", at: nowIso(), signal, result });
    } catch (err) {
      this.emit({ kind: "error", at: nowIso(), stage: "alert", error: err });
    }
  }

  private buildContext(signal: DivergenceSignal): FixtureContext {
    const teams = this.deps.resolveTeams?.(signal.fixtureId);
    const last = this.lastEvent.get(signal.fixtureId);
    return {
      fixtureId: signal.fixtureId,
      participant1: teams?.participant1 ?? `Fixture ${signal.fixtureId} P1`,
      participant2: teams?.participant2 ?? `Fixture ${signal.fixtureId} P2`,
      gamePhase: gamePhaseLabel(last?.gameState ?? ""),
      statLabel: statKeyLabel(signal.statKey),
    };
  }

  private prune(arr: OddsTick[], nowMs: number): void {
    const cutoff = nowMs - this.bufferMs;
    // Ticks arrive roughly in order; drop from the front while stale.
    while (arr.length > 0 && Date.parse(arr[0]!.receivedAt) < cutoff) arr.shift();
  }

  private emit(event: PipelineEvent): void {
    this.deps.onEvent?.(event);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
