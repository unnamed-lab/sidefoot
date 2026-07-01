import {
  getStatValidation as realGetStatValidation,
  checkStatOnChain as realCheckStatOnChain,
  validateStatOnChain as realValidateStatOnChain,
  decodeStatKey,
  type Predicate,
  type ScoresStatValidation,
  type ScoresStatValidationV2,
} from "txline-anchor";
import type { TxoracleProgram, TxClient } from "./session";
import type { ScoreEvent, VerifiedSignal } from "./types";

/**
 * The prover: the bridge between a fast, UNVERIFIED `ScoreEvent` and a slow,
 * cryptographically-anchored `VerifiedSignal`. It fetches the stat's Merkle
 * proof from TxLINE and evaluates a threshold predicate on-chain via
 * `validate_stat` — the same primitive TxLINE documents for trading settlement.
 *
 * Two honesty points baked in here (see txline-anchor INTEGRATION.md §2):
 *  - `validate_stat` returns a bool, it does NOT assert. A confirmed tx proves
 *    the stat is AUTHENTIC; the predicate boolean is a separate fact. A
 *    `VerifiedSignal` is only emitted when the stat is authentic AND the
 *    predicate held.
 *  - `provenAt` is the PROOF timestamp (when the on-chain call returned), and
 *    `latencyMs` is the real proof round-trip — surfaced, not hidden, because
 *    `validate_stat`'s ~1.4M CU budget makes it a genuinely interesting number.
 *
 * The TxLINE HTTP + on-chain calls are injected as `ports` so the prover's logic
 * is unit-testable without a network or a cluster; `defaultPorts` binds the real
 * txline-anchor implementations.
 */

// ── predicate + worthiness helpers (pure) ─────────────────────────────────────

/** Base stat keys that represent goals (P1 / P2). See txline-anchor statKeys. */
const GOAL_BASES = new Set([1, 2]);

/** Is this stat key a goal count? (period-agnostic) */
export function isGoalStat(statKey: number): boolean {
  try {
    return GOAL_BASES.has(decodeStatKey(statKey).base);
  } catch {
    return false;
  }
}

/**
 * MVP worthiness gate: only goals with a positive count are worth the ~1.4M-CU
 * proof round-trip. Cards/corners are stretch signal types (plan §10).
 */
export function isProofWorthy(event: ScoreEvent): boolean {
  return isGoalStat(event.statKey) && event.value > 0;
}

/**
 * Default predicate for a goal event: prove the authentic count exceeds the
 * previous one (`value > value - 1`). Anchors "a goal happened" cryptographically
 * — exactly the "P1 goals > previous count" check the plan describes.
 */
export function goalIncreasedPredicate(event: ScoreEvent): Predicate {
  return {
    threshold: Math.max(0, event.value - 1),
    comparison: { greaterThan: {} },
  };
}

// ── ports (injectable IO boundary) ────────────────────────────────────────────

export interface ProverPorts {
  getStatValidation: typeof realGetStatValidation;
  checkStatOnChain: typeof realCheckStatOnChain;
  validateStatOnChain: typeof realValidateStatOnChain;
  /** Resolve the confirmed tx's slot (best-effort; undefined if unavailable). */
  getSlot: (program: TxoracleProgram, signature: string) => Promise<number | undefined>;
}

async function defaultGetSlot(
  program: TxoracleProgram,
  signature: string
): Promise<number | undefined> {
  try {
    const statuses = await program.provider.connection.getSignatureStatuses([signature]);
    return statuses.value[0]?.slot ?? undefined;
  } catch {
    return undefined;
  }
}

export const defaultPorts: ProverPorts = {
  getStatValidation: realGetStatValidation,
  checkStatOnChain: realCheckStatOnChain,
  validateStatOnChain: realValidateStatOnChain,
  getSlot: defaultGetSlot,
};

// ── prover ────────────────────────────────────────────────────────────────────

export interface ProverDeps {
  program: TxoracleProgram;
  client: TxClient;
}

export interface ProveOptions {
  /**
   * Land a permanent on-chain proof tx (`validate_stat`). Default true — the
   * whole point is a verifiable record. Set false to simulate-only (read the
   * predicate without a tx, e.g. for cheap pre-checks).
   */
  record?: boolean;
  /** Override the predicate (default: goal-increased for the event's value). */
  predicate?: Predicate;
  /** Look up the tx slot after landing a proof (default true in record mode). */
  fetchSlot?: boolean;
}

/**
 * Full outcome of a proof attempt — retained (even when not "verified") so the
 * observability log can record proven-authentic-but-predicate-false cases.
 */
export interface ProofResult {
  /** True only when the proof is authentic AND the predicate held. */
  verified: boolean;
  predicateResult: boolean;
  predicate: Predicate;
  event: ScoreEvent;
  /** Proof timestamp — when the on-chain call returned. */
  provenAt: string;
  /** Proof round-trip latency (ms). */
  latencyMs: number;
  /** Present when a real proof tx was landed. */
  signature?: string;
  txSlot?: number;
  /** The `VerifiedSignal` when `verified`, else null. */
  signal: VerifiedSignal | null;
}

function asLegacyValidation(
  v: ScoresStatValidation | ScoresStatValidationV2
): ScoresStatValidation {
  if ("statToProve" in v && v.statToProve) return v;
  throw new Error(
    "stat-validation returned the V2 (statKeys) shape; the prover requests a single statKey and expects legacy ScoresStatValidation"
  );
}

/**
 * Prove one score event on-chain and, if the predicate holds, produce a
 * `VerifiedSignal`. Throws only if the proof itself is invalid (the stat isn't
 * authentic) or the HTTP/RPC call fails; a false predicate is a normal result.
 */
export async function proveScoreEvent(
  deps: ProverDeps,
  event: ScoreEvent,
  opts: ProveOptions = {},
  ports: ProverPorts = defaultPorts
): Promise<ProofResult> {
  const predicate = opts.predicate ?? goalIncreasedPredicate(event);
  const record = opts.record ?? true;

  const t0 = Date.now();
  const raw = await ports.getStatValidation(deps.client, {
    fixtureId: event.fixtureId,
    seq: event.seq,
    statKey: event.statKey,
  });
  const validation = asLegacyValidation(raw);

  let predicateResult: boolean;
  let signature: string | undefined;
  let txSlot: number | undefined;

  if (record) {
    const res = await ports.validateStatOnChain(deps.program, validation, predicate);
    predicateResult = res.predicateResult;
    signature = res.signature;
    if (opts.fetchSlot ?? true) {
      txSlot = await ports.getSlot(deps.program, res.signature);
    }
  } else {
    predicateResult = await ports.checkStatOnChain(deps.program, validation, predicate);
  }

  const latencyMs = Date.now() - t0;
  const provenAt = new Date().toISOString();
  const verified = predicateResult;

  const signal: VerifiedSignal | null = verified
    ? {
        fixtureId: event.fixtureId,
        statKey: event.statKey,
        provenAt,
        ...(txSlot !== undefined ? { txSlot } : {}),
        ...(signature !== undefined ? { txSignature: signature } : {}),
        scoreEventReceivedAt: event.receivedAt,
        latencyMs,
      }
    : null;

  return {
    verified,
    predicateResult,
    predicate,
    event,
    provenAt,
    latencyMs,
    ...(signature !== undefined ? { signature } : {}),
    ...(txSlot !== undefined ? { txSlot } : {}),
    signal,
  };
}
