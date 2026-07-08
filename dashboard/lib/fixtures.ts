/**
 * The fixtures board — every TxLINE fixture with its competition (sport
 * category), kickoff time, live/scheduled/finished status, and whether odds are
 * trading right now. Produced by `pnpm feed` (writeBoard) from real TxLINE data.
 */
export type FixtureStatus = "live" | "scheduled" | "finished";

export interface BoardFixture {
  fixtureId: number;
  participant1: string;
  participant2: string;
  competition: string;
  competitionId: number;
  startTime: string;
  status: FixtureStatus;
  /** TxLINE is quoting odds for it right now (may be pre-match). */
  trading: boolean;
  /** "1-0" for started matches, else undefined. */
  score?: string;
}

export interface Competition {
  competition: string;
  competitionId: number;
  fixtures: BoardFixture[];
}

export interface FixturesBoardData {
  generatedAt: string;
  network: string;
  competitions: Competition[];
}

import { cacheGet, cacheSet, fetchWithTimeout } from "./cache";

const CACHE_KEY = "sidefoot.fixtures";

/** Live API first (with a fast timeout) → localStorage cache → static snapshot. */
export async function loadFixtures(): Promise<FixturesBoardData> {
  try {
    const res = await fetchWithTimeout("/api/fixtures", 9000);
    if (res.ok) {
      const data = (await res.json()) as FixturesBoardData;
      cacheSet(CACHE_KEY, data);
      return data;
    }
  } catch {
    /* timeout / offline — fall through */
  }
  const cached = cacheGet<FixturesBoardData>(CACHE_KEY);
  if (cached) return cached;
  const res = await fetch("/fixtures.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`fixtures load failed: ${res.status}`);
  return (await res.json()) as FixturesBoardData;
}

const MATCH_MS = 150 * 60_000; // a match is over ~2.5h after kickoff

/**
 * Status recomputed from kickoff time on every render, so live/scheduled/
 * finished is never stale even if the JSON snapshot is a few minutes old.
 * Falls back to the stored status when there's no kickoff time.
 */
export function liveStatus(f: BoardFixture): FixtureStatus {
  const start = f.startTime ? Date.parse(f.startTime) : NaN;
  if (!Number.isFinite(start)) return f.status;
  const now = Date.now();
  if (now >= start + MATCH_MS) return "finished";
  if (now >= start) return "live";
  return "scheduled";
}
