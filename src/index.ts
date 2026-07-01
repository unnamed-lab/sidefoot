/**
 * Sidefoot — public module surface.
 *
 * Watches TxLINE live odds against on-chain-provable score events and flags the
 * moment the market lags a Merkle-proof-verified stat change. This barrel
 * re-exports the pieces the ingestion worker, detector, and dashboard share.
 */
export type {
  OddsTick,
  ScoreEvent,
  VerifiedSignal,
  DivergenceSignal,
  DivergenceType,
  DivergenceObservation,
  SeriesObservation,
  FeedKind,
  FixtureContext,
  Confidence,
  SignalExplanation,
} from "./types";

export { gamePhaseLabel, statKeyLabel } from "./gamePhase";

export { loadReasoningConfig, type ReasoningConfig } from "./env";
export { explainSignal } from "./reasoning/explain";
export {
  SIDEFOOT_EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPayload,
} from "./reasoning/prompt";
export {
  parseSignalExplanation,
  assertWithinBoundary,
  ExplanationError,
} from "./reasoning/parse";
export { createAnthropicPort, type LlmPort } from "./reasoning/llm";

export { normalizeOdds, normalizeScores, parsePct } from "./normalize";

export {
  detectLaggingMarket,
  evaluateLaggingMarket,
  type LaggingMarketConfig,
  type LaggingMarketStatus,
  type LaggingMarketVerdict,
} from "./detector";

export { loadEnv, type SidefootEnv } from "./env";
export {
  bootstrapSession,
  type Session,
  type BootstrapOptions,
  type TxoracleProgram,
  type TxClient,
} from "./session";

export {
  proveScoreEvent,
  goalIncreasedPredicate,
  isGoalStat,
  isProofWorthy,
  defaultPorts,
  type ProverDeps,
  type ProverPorts,
  type ProveOptions,
  type ProofResult,
} from "./prover";
export { explorerTxUrl } from "./explorer";

export {
  startIngestion,
  type IngestionHandlers,
  type IngestionOptions,
} from "./ingest/worker";
export {
  ReplayRecorder,
  type RecordedFrame,
} from "./ingest/recorder";
