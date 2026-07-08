/**
 * The dashboard's data contract. Mirrors what the Sidefoot pipeline emits to its
 * observability log (proofs, verdicts, signals) plus the normalized odds series,
 * flattened per fixture into a single feed the UI renders. A replay run or the
 * live worker produces `feed.json`; the committed sample lets the UI render out
 * of the box.
 */
export type Confidence = "low" | "medium" | "high";

/** One odds observation for the fixture's tracked market/selection. */
export interface OddsPoint {
  /** ISO local-receipt time. */
  t: string;
  /** Implied probability 0–1. */
  p: number;
}

/** A proven score event — the moment an on-chain validate_stat proof landed. */
export interface ProofMarker {
  provenAt: string;
  statLabel: string;
  txSignature?: string;
  /** Proof round-trip (ms) — surfaced honestly, not hidden. */
  latencyMs: number;
}

/** A fired LAGGING_MARKET signal with its explanation and checkable evidence. */
export interface SignalItem {
  detectedAt: string;
  statLabel: string;
  explanation: string;
  confidence: Confidence;
  /** Largest implied-probability shift the market made in-window. */
  maxObservedShift: number;
  postTickCount: number;
  windowMs: number;
  provenAt: string;
  scoreEventReceivedAt: string;
  txSignature?: string;
  latencyMs: number;
}

export interface FixtureFeed {
  fixtureId: number;
  participant1: string;
  participant2: string;
  currentScore?: string;
  gamePhase: string;
  /** Kickoff time (ISO) — enables match-clock axis + never-stale phase. */
  startTime?: string;
  /** Human label for the tracked odds series, e.g. "Match winner — Home". */
  marketLabel: string;
  odds: OddsPoint[];
  proofs: ProofMarker[];
  signals: SignalItem[];
}

export interface DashboardFeed {
  generatedAt: string;
  network: "devnet" | "mainnet";
  /** Explorer query suffix, e.g. "?cluster=devnet". */
  explorerCluster: string;
  /** True when this is illustrative sample data, not a captured run. */
  sample: boolean;
  fixtures: FixtureFeed[];
}

export function explorerTxUrl(feed: Pick<DashboardFeed, "explorerCluster">, sig: string): string {
  return `https://explorer.solana.com/tx/${sig}${feed.explorerCluster}`;
}

/**
 * Phase recomputed from kickoff on every render (never stale). Returns a live
 * match minute during play, else Pre-match / Halftime / Full Time. Falls back to
 * the stored phase when there's no kickoff time.
 */
export function matchPhase(startTime: string | undefined, fallback: string): string {
  if (!startTime) return fallback;
  const start = Date.parse(startTime);
  if (!Number.isFinite(start)) return fallback;
  const min = (Date.now() - start) / 60_000;
  if (min < 0) return "Pre-match";
  if (min >= 150) return "Full Time";
  if (min <= 45) return `${Math.max(1, Math.ceil(min))}'`;
  if (min <= 60) return "Halftime";
  if (min <= 105) return `${Math.ceil(min - 15)}'`; // 2nd half, minus ~15m break
  return "Full Time";
}

export function isLivePhase(phase: string): boolean {
  return phase !== "Pre-match" && phase !== "Full Time";
}

import { cacheGet, cacheSet, fetchWithTimeout } from "./cache";

const CACHE_KEY = "sidefoot.feed";

/**
 * Live API first (with a fast timeout) → localStorage cache → static snapshot.
 * `fixtureId` asks the API to make sure that specific fixture is included.
 */
export async function loadFeed(fixtureId?: number | null): Promise<DashboardFeed> {
  try {
    const url = fixtureId ? `/api/feed?fixture=${fixtureId}` : "/api/feed";
    const res = await fetchWithTimeout(url, 9000);
    if (res.ok) {
      const data = (await res.json()) as DashboardFeed;
      cacheSet(CACHE_KEY, data);
      return data;
    }
  } catch {
    /* timeout / offline — fall through */
  }
  const cached = cacheGet<DashboardFeed>(CACHE_KEY);
  if (cached) return cached;
  const res = await fetch("/feed.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`feed load failed: ${res.status}`);
  return (await res.json()) as DashboardFeed;
}
