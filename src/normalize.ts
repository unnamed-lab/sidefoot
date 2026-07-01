import type { OddsPayload, Scores } from "txline-anchor";
import type { OddsTick, ScoreEvent } from "./types";

/**
 * Pure normalization from raw txline-anchor wire records to Sidefoot's domain
 * shapes. No IO, no clock of its own — the caller passes `receivedAt` (the local
 * SSE receipt time) so this stays deterministic and unit-testable.
 */

/**
 * Parse a demargined percentage field (`Pct[i]`, e.g. "52.381" or "NA") into a
 * probability in [0,1]. Returns undefined for "NA"/blank/unparseable.
 */
export function parsePct(pct: string | undefined): number | undefined {
  if (!pct || pct === "NA") return undefined;
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n / 100;
}

/** Build a stable market descriptor from the payload's market fields. */
function marketDescriptor(p: OddsPayload): string {
  const parts = [p.SuperOddsType];
  if (p.MarketPeriod) parts.push(p.MarketPeriod);
  if (p.MarketParameters) parts.push(p.MarketParameters);
  return parts.join(":");
}

/**
 * Flatten one raw odds message into per-selection `OddsTick`s.
 *
 * A message carries parallel arrays `PriceNames` / `Prices` / `Pct`; each index
 * is one selection. Implied probability prefers the demargined `Pct` (the fair
 * probability), falling back to `1 / decimalOdds` when `Pct` is "NA"/missing.
 * Selections with neither a usable Pct nor a positive price are dropped.
 */
export function normalizeOdds(p: OddsPayload, receivedAt: string): OddsTick[] {
  const names = p.PriceNames ?? [];
  const prices = p.Prices ?? [];
  const pcts = p.Pct ?? [];
  const market = marketDescriptor(p);
  const ticks: OddsTick[] = [];

  for (let i = 0; i < names.length; i++) {
    const selection = names[i];
    if (selection === undefined) continue;

    const decimalOdds = prices[i];
    const fromPct = parsePct(pcts[i]);
    const fromPrice =
      decimalOdds !== undefined && decimalOdds > 0 ? 1 / decimalOdds : undefined;
    const impliedProbability = fromPct ?? fromPrice;
    if (impliedProbability === undefined) continue; // nothing usable for this leg

    ticks.push({
      fixtureId: p.FixtureId,
      market,
      selection,
      impliedProbability,
      decimalOdds: decimalOdds !== undefined && decimalOdds > 0 ? decimalOdds : undefined,
      receivedAt,
      bookmakerId: p.BookmakerId,
      messageId: p.MessageId,
    });
  }

  return ticks;
}

/**
 * Flatten one raw scores record into per-stat `ScoreEvent`s.
 *
 * The `Stats` map is `{ "<statKey>": value }` — one update can touch several
 * stats. Records with no `Stats` (e.g. pure clock/state ticks) yield nothing.
 */
export function normalizeScores(s: Scores, receivedAt: string): ScoreEvent[] {
  const stats = s.Stats;
  if (!stats) return [];

  const events: ScoreEvent[] = [];
  for (const [key, value] of Object.entries(stats)) {
    const statKey = Number(key);
    if (!Number.isInteger(statKey)) continue;
    events.push({
      fixtureId: s.FixtureId,
      seq: s.Seq,
      statKey,
      value,
      gameState: s.GameState ?? "",
      receivedAt,
    });
  }
  return events;
}
