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

export async function loadFixtures(): Promise<FixturesBoardData> {
  const res = await fetch("/fixtures.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`fixtures load failed: ${res.status}`);
  return (await res.json()) as FixturesBoardData;
}
