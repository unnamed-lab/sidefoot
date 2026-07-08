# Sidefoot — TxLINE Trading Tools & Agents submission

**The market is slow. The proof isn't.**

Sidefoot watches TxLINE's live consensus odds against score events it can
*cryptographically prove on-chain*, and flags the moment the market hasn't caught
up to a goal that is already provably true. Every signal is anchored to a real
Solana `validate_stat` transaction a judge can open on the explorer — a proof,
not a claim.

- **Live app:** https://sidefoot.vercel.app
- **Live API (devnet reads):** https://sidefoot.vercel.app/api/fixtures · https://sidefoot.vercel.app/api/feed
- **Repo:** https://github.com/unnamed-lab/sidefoot
- **A real proof (devnet):** [`5X7PRhn…VoxcWF`](https://explorer.solana.com/tx/5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF?cluster=devnet)

---

## 1. Core idea

TxLINE gives two things about a match that carry different trust:

1. **Odds** — fast, but *unverified*. "What the market currently believes."
2. **Score events** — which can be run through the Txoracle `validate_stat`
   instruction on Solana to get a **Merkle-proof-verified** fact.

When a stat is **proven true on-chain** but the odds **haven't moved** within a
short window, that gap is the edge. Sidefoot detects exactly that — a *lagging
market* — and surfaces it with the on-chain proof attached.

This is a direct, documented use of TxLINE's own primitive: TxLINE lists on-chain
validation for "trading settlement," "conditional logic," and "automated markets."
Sidefoot is the trading-agent-shaped version — the trust mechanism (a Merkle proof
checked against `Txoracle.validate_stat`) is identical, applied to real-time
alerting instead of settlement.

## 2. How it runs (autonomous pipeline)

`ingest → prove → wait the market's window → detect → explain → alert`

- **Ingest** — `streamOdds` / `streamScores` (SSE), normalized to `OddsTick` /
  `ScoreEvent`.
- **Prove** — a goal is proven on-chain via `getStatValidation` +
  `validate_stat`; a `VerifiedSignal` is emitted only when the stat is authentic
  **and** the predicate holds (`validate_stat` returns a bool, it doesn't assert).
- **Detect** — a pure `detectLaggingMarket` over proven-vs-odds (functional core,
  fully unit-tested): baseline = latest pre-proof tick per market/selection/
  bookmaker; a 3-way verdict `LAGGING_MARKET` / `MARKET_MOVED` / `INSUFFICIENT_DATA`
  (zero in-window ticks is a feed gap, **not** a signal).
- **Explain** — a reasoning layer turns the structural signal into one
  boundary-safe sentence (it explains the computed signal; it never judges the
  market or recommends a trade).
- **Alert** — pushed to Telegram via Herald (execution layer).

Runs unattended once started. The whole thing is built on our own
`txline-anchor` client package — auth, subscription, data, SSE, and on-chain
proof validation wrapped once so the product never touches raw TxLINE plumbing.

## 3. TxLINE endpoints used

Off-chain REST/SSE (`https://txline-dev.txodds.com`):

| Endpoint | Use |
|---|---|
| `POST /auth/guest/start` | guest JWT |
| `POST /api/token/activate` | activate the API token after on-chain subscribe |
| `GET /api/fixtures/snapshot` | fixtures board (teams, competition, kickoff) |
| `GET /api/odds/snapshot/{fixtureId}` | current odds |
| `GET /api/odds/updates/{fixtureId}` | recent odds history (the odds series) |
| `GET /api/odds/stream` (SSE) | live odds ingestion |
| `GET /api/odds/validation` | message/batch-level odds Merkle proof |
| `GET /api/scores/snapshot/{fixtureId}` | current scores / stats |
| `GET /api/scores/historical/{fixtureId}` | full historical score sequence |
| `GET /api/scores/updates/{fixtureId}` | recent score updates |
| `GET /api/scores/stream` (SSE) | live scores ingestion |
| `GET /api/scores/stat-validation` | per-stat Merkle proof (feeds `validate_stat`) |

On-chain (Txoracle program, Solana devnet): `subscribe`, `validate_stat`,
`validate_odds`.

## 4. Technical highlights

- **On-chain proof anchor** — signals are backed by real `validate_stat` txs
  (verifiable on the explorer), not a claim over a raw feed.
- **Deterministic, tested core** — `detectLaggingMarket` and the normalizers are
  pure and fully unit-tested (54 tests); the SSE/RPC/HTTP calls are the imperative
  shell around them, all behind injectable ports.
- **Live deployment** — Next.js dashboard on Vercel with `/api/fixtures` and
  `/api/feed` serverless routes doing fast TxLINE reads (parallelized, per-fetch
  timeout, localStorage cache, static-snapshot fallback so it never hangs).
- **Honesty by construction** — the "verified" timestamp is the on-chain proof
  time (not the raw SSE receipt), and the proof round-trip is shown as evidence,
  never hidden.

## 5. Real-world viability

- **Who pays:** a subscription per tracked fixture for individual sharp bettors,
  or a usage-based API fee for small trading desks piping the signal feed into
  their own systems.
- **Wedge → platform:** the same detector generalises to any TxLINE-covered
  sport once World Cup coverage ends (different stat keys, same pattern).
- **Moat:** the accumulated, publicly-checkable signal log becomes a track record
  a competitor has to rebuild from zero.

## 6. TxLINE API — our experience

**What we liked**
- **One normalised JSON schema** across fixtures/odds/scores made scaling from a
  single fixture to the whole World Cup slate trivial.
- **On-chain anchoring is the standout.** `validate_stat` / `validate_odds`
  against daily Merkle roots is genuinely differentiated — it let us build a
  product whose signals are independently verifiable, which nothing else in this
  space offers.
- Rich, granular data (per-period stat keys, demargined `Pct`) — enough to build
  real logic on.

**Where we hit friction** (all surmountable; documented here as feedback)
- **Docs vs reality drift on devnet.** The runnable examples pointed at a dead
  host (`oracle-dev.txodds.com`); the live devnet host is `txline-dev.txodds.com`.
  The shipped IDL carried **mainnet** constants (program id, TxL mint) that don't
  exist on devnet, so they can't be derived from the IDL for devnet.
- **`validate_stat` semantics aren't in the IDL.** It doesn't assert — it reverts
  only on an invalid proof and otherwise returns the predicate result as program
  return-data (one byte). Its `ts` argument must be the batch **start** timestamp
  (`summary.updateStats.minTimestamp`), not the top-level event `ts`, or it errors
  `6010 TimestampMismatch`. This took live-log spelunking to pin down.
- **Casing split.** Scores snapshot/stream responses are **PascalCase**
  (`FixtureId`, `Seq`, `Stats`) while stat-validation is **camelCase**. Worth
  documenting on the schema page.
- **`subscribe` duration** must be a multiple of 4 weeks (min 4); the examples'
  `1` is rejected on-chain.
- **`GameState` isn't a reliable finished/live signal** on the devnet feed — we
  classify match status from kickoff time instead.
- **Odds have no per-stat on-chain predicate** (only batch-membership via
  `validate_odds`) — correct by design, but worth stating up front so builders
  anchor divergence logic to the scores side, as we did.
