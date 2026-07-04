# Sidefoot dashboard

A single-screen view of Sidefoot's proven-score divergence detector: live odds
plotted against on-chain-proven score events, with the moment the market lags a
proof called out as a signal.

> Next.js (App Router) · Tailwind · Recharts. Deploys to Vercel; the long-running
> ingestion worker runs separately (it needs a persistent SSE process).

## What's on screen

- **Fixture selector** — switch between the 2–3 tracked matches (a dot marks a
  fixture with an active signal).
- **Score + phase header** — current score and a readable game phase mapped from
  TxLINE's `GameState` encoding, plus the chart legend.
- **Divergence timeline** (centre) — odds plotted continuously (blue); each proven
  score event marked at the instant its on-chain proof landed (green diamond →
  **click to open the `validate_stat` tx on Solana Explorer**); the window
  Sidefoot watched shaded amber. Odds staying flat across an amber band *is* the
  signal.
- **Signal feed** (right) — each fired signal leads with the reasoning layer's
  one-line explanation and a confidence label; the **why?** expander opens the
  raw, checkable evidence: the honest timestamps (raw SSE receipt vs the proof
  time), the odds movement compared, and a link to the proof on-chain.

## Data

The page renders `public/feed.json`, whose shape is [`lib/feed.ts`](lib/feed.ts)
— the flattened form of what the Sidefoot pipeline writes to its observability
log (proofs, verdicts, signals) alongside the normalized odds series.

The committed `feed.json` is a **sample replay** (flagged `"sample": true`) built
around the real devnet proof
[`5X7PRhn…`](https://explorer.solana.com/tx/5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF?cluster=devnet)
so the UI renders out of the box. A real capture (or the live worker) overwrites
it with `"sample": false`.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
```

## Honesty notes (shown in the footer)

- The "verified" timestamp is when the on-chain proof returned — **not** the raw
  SSE receipt. The proof round-trip is surfaced as evidence, never hidden.
- Sidefoot explains the structural signal it computed; it does not judge whether
  the market is "wrong", and is not trading advice.
