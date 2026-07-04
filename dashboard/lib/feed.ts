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

export async function loadFeed(): Promise<DashboardFeed> {
  const res = await fetch("/feed.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`feed load failed: ${res.status}`);
  return (await res.json()) as DashboardFeed;
}
