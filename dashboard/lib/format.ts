import type { Confidence } from "./feed";

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const pct = (p: number, digits = 1): string => `${(p * 100).toFixed(digits)}%`;

export const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export const shortSig = (sig: string): string => `${sig.slice(0, 4)}…${sig.slice(-4)}`;

/** Tailwind text/border colour classes per confidence label. */
export const confidenceClasses: Record<Confidence, string> = {
  high: "text-proof border-proof/40 bg-proof/10",
  medium: "text-signal border-signal/40 bg-signal/10",
  low: "text-muted border-line bg-white/5",
};
