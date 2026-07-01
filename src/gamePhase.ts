import { decodeStatKey } from "txline-anchor";

/**
 * Map TxLINE's `GameState` wire string and encoded stat keys into readable
 * labels for the dashboard and the reasoning layer's fixture context.
 *
 * The live scores feed sends `GameState` as short codes ("1H", "HT", "2H", …).
 * Anything unrecognised is passed through unchanged so an unexpected code shows
 * up honestly rather than being silently mislabelled.
 */
const GAME_PHASE_LABELS: Record<string, string> = {
  NS: "Not Started",
  "1H": "1st Half",
  HT: "Halftime",
  "2H": "2nd Half",
  ET: "Extra Time",
  ET1: "Extra Time 1st Half",
  ET2: "Extra Time 2nd Half",
  PEN: "Penalties",
  FT: "Full Time",
  AET: "After Extra Time",
  ABAN: "Abandoned",
  SUSP: "Suspended",
};

export function gamePhaseLabel(gameState: string): string {
  if (!gameState) return "Unknown";
  return GAME_PHASE_LABELS[gameState.toUpperCase()] ?? gameState;
}

/** Readable label for a base stat number (1–8, period-agnostic). */
const BASE_STAT_LABELS: Record<number, string> = {
  1: "P1 goals",
  2: "P2 goals",
  3: "P1 yellow cards",
  4: "P2 yellow cards",
  5: "P1 red cards",
  6: "P2 red cards",
  7: "P1 corners",
  8: "P2 corners",
};

/**
 * Readable label for an encoded stat key, e.g. `statKey(1,"H1")` → "P1 goals (1st Half)".
 * Falls back to the raw key if it can't be decoded.
 */
export function statKeyLabel(statKey: number): string {
  try {
    const { base, period } = decodeStatKey(statKey);
    const baseLabel = BASE_STAT_LABELS[base] ?? `stat ${base}`;
    return period === "FULL_GAME" ? baseLabel : `${baseLabel} (${periodLabel(period)})`;
  } catch {
    return `stat ${statKey}`;
  }
}

function periodLabel(period: string): string {
  switch (period) {
    case "H1":
      return "1st Half";
    case "H2":
      return "2nd Half";
    case "ET1":
      return "Extra Time 1st Half";
    case "ET2":
      return "Extra Time 2nd Half";
    case "PENALTIES":
      return "Penalties";
    default:
      return period;
  }
}
