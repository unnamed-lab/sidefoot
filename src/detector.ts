import type {
  OddsTick,
  VerifiedSignal,
  DivergenceSignal,
  SeriesObservation,
} from "./types";

/**
 * The functional core: divergence detection. Pure — no IO, no network, and no
 * clock of its own (every timestamp is derived from the inputs), so it is fully
 * unit-testable against constructed fixtures without a live feed or cluster.
 *
 * Signal type (MVP): LAGGING MARKET. A score stat has been proven on-chain
 * (`VerifiedSignal`) but the corresponding odds market has NOT moved within an
 * expected window after the *proof* landed.
 *
 * Trust boundary this respects: odds carry no on-chain predicate (see
 * txline-anchor INTEGRATION.md §5), so the movement test runs off-chain over the
 * odds ticks, while the *event being reacted to* is anchored to a real
 * `validate_stat` proof. The detector never treats a raw score event as ground
 * truth — only a `VerifiedSignal`.
 *
 * Honesty about feed gaps: devnet SSE drops frequently. If there are no
 * measurable post-proof ticks at all, that is INSUFFICIENT_DATA (can't tell a
 * lagging market from a feed gap), NOT a signal. We only raise LAGGING_MARKET
 * when the market was demonstrably live in-window yet failed to move.
 */

export interface LaggingMarketConfig {
  /** How long after the proof the market is given to react. */
  expectedMoveWindowMs: number;
  /** Absolute implied-probability change that counts as "the market reacted". */
  minProbabilityShift: number;
}

export type LaggingMarketStatus =
  | "LAGGING_MARKET"
  | "MARKET_MOVED"
  | "INSUFFICIENT_DATA";

export interface LaggingMarketVerdict {
  status: LaggingMarketStatus;
  fixtureId: number;
  statKey: number;
  windowMs: number;
  /** When the window closed — the earliest moment a lag can be concluded. */
  detectedAt: string;
  maxObservedShift: number;
  postTickCount: number;
  series: SeriesObservation[];
  evidence: VerifiedSignal;
}

/** Compare like-for-like: same bookmaker's price on the same market selection. */
function seriesKey(t: OddsTick): string {
  return `${t.market}|${t.selection}|${t.bookmakerId}`;
}

/**
 * Evaluate whether the market lagged a proven stat change, returning a full
 * verdict (including the MARKET_MOVED / INSUFFICIENT_DATA outcomes) for the
 * observability log. `detectLaggingMarket` is the thin signal-or-null wrapper.
 */
export function evaluateLaggingMarket(
  proven: VerifiedSignal,
  oddsTicks: readonly OddsTick[],
  config: LaggingMarketConfig
): LaggingMarketVerdict {
  const { expectedMoveWindowMs: windowMs, minProbabilityShift } = config;
  const provenAtMs = new Date(proven.provenAt).getTime();
  const windowEndMs = provenAtMs + windowMs;
  const detectedAt = new Date(windowEndMs).toISOString();

  // Group the fixture's ticks into per-(market,selection,bookmaker) series.
  const groups = new Map<string, OddsTick[]>();
  for (const t of oddsTicks) {
    if (t.fixtureId !== proven.fixtureId) continue;
    const key = seriesKey(t);
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const series: SeriesObservation[] = [];
  let maxObservedShift = 0;
  let postTickCount = 0;

  for (const ticks of groups.values()) {
    // Baseline = the market's belief at the instant the proof landed: the most
    // recent tick at or before provenAt. A series with no prior tick isn't
    // measurable (we have nothing to measure a shift against) — skip it.
    let baseline: OddsTick | undefined;
    for (const t of ticks) {
      const ms = new Date(t.receivedAt).getTime();
      if (ms <= provenAtMs) {
        if (!baseline || ms > new Date(baseline.receivedAt).getTime()) baseline = t;
      }
    }
    if (!baseline) continue;

    // Post-proof ticks strictly after the proof, within the window.
    let seriesPostCount = 0;
    let seriesMaxShift = 0;
    for (const t of ticks) {
      const ms = new Date(t.receivedAt).getTime();
      if (ms > provenAtMs && ms <= windowEndMs) {
        seriesPostCount++;
        const shift = Math.abs(t.impliedProbability - baseline.impliedProbability);
        if (shift > seriesMaxShift) seriesMaxShift = shift;
      }
    }

    postTickCount += seriesPostCount;
    if (seriesMaxShift > maxObservedShift) maxObservedShift = seriesMaxShift;
    series.push({
      market: baseline.market,
      selection: baseline.selection,
      bookmakerId: baseline.bookmakerId,
      baselineProbability: baseline.impliedProbability,
      maxShift: seriesMaxShift,
      postTickCount: seriesPostCount,
    });
  }

  let status: LaggingMarketStatus;
  if (postTickCount === 0) {
    status = "INSUFFICIENT_DATA"; // no measurable in-window activity → can't tell lag from a gap
  } else if (maxObservedShift >= minProbabilityShift) {
    status = "MARKET_MOVED"; // the market reacted — no divergence
  } else {
    status = "LAGGING_MARKET"; // live market, but it didn't move enough
  }

  return {
    status,
    fixtureId: proven.fixtureId,
    statKey: proven.statKey,
    windowMs,
    detectedAt,
    maxObservedShift,
    postTickCount,
    series,
    evidence: proven,
  };
}

/**
 * Primary MVP detector. Returns a LAGGING_MARKET `DivergenceSignal` when a
 * proven stat change wasn't matched by odds movement in-window, else null.
 */
export function detectLaggingMarket(
  proven: VerifiedSignal,
  oddsTicks: readonly OddsTick[],
  config: LaggingMarketConfig
): DivergenceSignal | null {
  const v = evaluateLaggingMarket(proven, oddsTicks, config);
  if (v.status !== "LAGGING_MARKET") return null;
  return {
    type: "LAGGING_MARKET",
    fixtureId: v.fixtureId,
    statKey: v.statKey,
    windowMs: v.windowMs,
    detectedAt: v.detectedAt,
    evidence: v.evidence,
    observed: {
      maxObservedShift: v.maxObservedShift,
      postTickCount: v.postTickCount,
      series: v.series,
    },
  };
}
