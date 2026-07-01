/**
 * Sidefoot's own domain types — the normalized, feed-agnostic shapes the
 * detector and UI reason about. They are intentionally separate from the raw
 * `txline-anchor` wire types (`OddsPayload`, `Scores`), because the whole point
 * of Sidefoot is to keep the two feeds' *trust levels* structurally distinct:
 *
 *   - an `OddsTick` is fast and UNVERIFIED — "what the market currently believes".
 *   - a `ScoreEvent` is fast but still unverified — TxLINE's own real-time SSE.
 *   - a `VerifiedSignal` is the SLOW, cryptographically-anchored fact: a stat
 *     whose authenticity + predicate was proven on-chain via `validate_stat`.
 *
 * The divergence detector compares odds movement against `VerifiedSignal`s, not
 * raw score events, so every alert traces to a real on-chain proof.
 */

/**
 * One market selection's price at a moment, flattened from a raw `OddsPayload`
 * (which carries many selections per message). Unverified by nature.
 */
export interface OddsTick {
  fixtureId: number;
  /** Market descriptor, e.g. "1X2" / "OVER_UNDER" (from SuperOddsType + period). */
  market: string;
  /** The specific selection within the market, e.g. "Home", "Over 2.5". */
  selection: string;
  /** Fair (demargined) implied probability in [0,1]. */
  impliedProbability: number;
  /** Raw decimal odds for the selection, when present. */
  decimalOdds?: number;
  /** Local receipt time — NOT TxLINE's `Ts`. See README on timestamp honesty. */
  receivedAt: string;
  /** Bookmaker id the tick came from (odds are per-bookmaker). */
  bookmakerId: number;
  /** TxLINE message id — the unit `validate_odds` can prove authentic. */
  messageId: string;
}

/**
 * One stat change on a fixture, flattened from a raw `Scores` record's `Stats`
 * map (which can carry several stat keys per update). Fast but UNVERIFIED — this
 * is the signal that *something* changed and is worth proving on-chain.
 */
export interface ScoreEvent {
  fixtureId: number;
  /** Monotonic scores sequence number (`Seq`) for ordering/dedup. */
  seq: number;
  /** Encoded stat key (see txline-anchor `statKey`); the `Stats` map key. */
  statKey: number;
  /** The stat's value in this update. */
  value: number;
  /**
   * TxLINE game-phase string (`GameState`) as it arrives on the wire, e.g.
   * "1H"/"HT"/"2H". The plan sketched this as a numeric code; the live API
   * sends a string, so we keep the string and map to labels at the edge.
   */
  gameState: string;
  /** Local receipt time — NOT TxLINE's `Ts`. */
  receivedAt: string;
}

/**
 * A score stat proven authentic (and predicate-evaluated) on-chain. The
 * "verified" timestamp is the PROOF timestamp, deliberately distinct from the
 * SSE receipt time of the underlying `ScoreEvent`.
 */
export interface VerifiedSignal {
  fixtureId: number;
  statKey: number;
  /** When `validateStatOnChain` / `checkStatOnChain` returned true. */
  provenAt: string;
  /** Devnet tx slot of the proof, when a real tx was landed. */
  txSlot?: number;
  /** Solana Explorer-resolvable proof tx signature, when landed. */
  txSignature?: string;
  /** SSE receipt time of the score event this proof corresponds to. */
  scoreEventReceivedAt: string;
  /** Proof round-trip latency (ms) — surfaced honestly, not hidden. */
  latencyMs: number;
}

export type DivergenceType = "LAGGING_MARKET";

/**
 * The odds-side observation for one (market, selection, bookmaker) price series
 * around a proof — the raw evidence behind a "the market didn't move" claim.
 */
export interface SeriesObservation {
  market: string;
  selection: string;
  bookmakerId: number;
  /** Market's implied probability at the instant the proof landed. */
  baselineProbability: number;
  /** Largest absolute probability shift from baseline within the window. */
  maxShift: number;
  /** Post-proof ticks in this series considered within the window. */
  postTickCount: number;
}

/** Aggregate odds-side evidence attached to a divergence signal. */
export interface DivergenceObservation {
  /** Largest absolute probability shift observed across all measured series. */
  maxObservedShift: number;
  /** Total post-proof ticks considered across all measured series. */
  postTickCount: number;
  /** Per-series detail for the observability log / UI "why" expander. */
  series: SeriesObservation[];
}

/** A structural divergence the detector computed. Pure data, no prose. */
export interface DivergenceSignal {
  type: DivergenceType;
  fixtureId: number;
  statKey: number;
  windowMs: number;
  detectedAt: string;
  /** The on-chain proof this signal is anchored to. */
  evidence: VerifiedSignal;
  /** The odds-side evidence: what the market did (or didn't do) in-window. */
  observed: DivergenceObservation;
}

/** Which raw feed a recorded/normalized event came from. */
export type FeedKind = "odds" | "scores";
