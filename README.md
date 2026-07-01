# Sidefoot

Sidefoot watches TxLINE's live **odds** stream against TxLINE's own
cryptographically **provable score events**, and flags the moment the market
hasn't caught up to something that's already been proven true on-chain.

Every signal it raises is backed by a real on-chain `validate_stat` call a judge
can independently verify against Solana Explorer — a proof, not a claim.

> **Status:** Day 3 scaffold. The ingestion worker + replay recorder are wired
> and devnet-verified; the divergence detector (Day 4), on-chain proof step
> (Day 5), reasoning layer (Day 6), alerts (Day 7) and dashboard (Day 8+) follow.

---

## Why the on-chain proof matters here

TxLINE's docs list on-chain validation for *trading settlement*, *conditional
logic*, and *automated markets*. Sidefoot is the trading-agent-shaped version of
that same primitive: instead of settling a trade it triggers an alert, but the
trust mechanism — a Merkle proof checked against `Txoracle.validate_stat` — is
identical.

## The two feeds, kept structurally separate

The whole design keeps the feeds' **trust levels** distinct (see
[`src/types.ts`](src/types.ts)):

| Feed | Speed | Trust | Sidefoot type |
|---|---|---|---|
| Odds (`streamOdds`) | fast | **unverified** — "what the market believes" | `OddsTick` |
| Scores (`streamScores`) | fast | unverified real-time SSE — "something changed" | `ScoreEvent` |
| `validate_stat` proof | slower | **cryptographically anchored on-chain** | `VerifiedSignal` |

The divergence detector compares odds movement against **proven** stat changes,
not raw score events.

### An honesty note on timestamps

A score *event* arrives fast over SSE (unverified). The *proof* that it's
anchored on-chain arrives slightly later (an API call plus an on-chain view
call). Sidefoot's `VerifiedSignal.provenAt` is the **proof** timestamp, never the
raw SSE receipt time — the two are deliberately not conflated, and the proof
round-trip latency is surfaced as evidence, not hidden.

## Built entirely on `txline-anchor`

All TxLINE/Txoracle access goes through the
[`txline-anchor`](https://github.com/unnamed-lab/txline-anchor) package (auth,
subscribe, streaming, on-chain proof validation). Sidefoot **never** calls the
TxLINE REST API or the Txoracle program directly. Key constraints that shape the
design, from that package's `INTEGRATION.md`:

- **Odds have no on-chain predicate** — only batch-membership proofs
  (`validate_odds`). Divergence logic runs off-chain over proven-authentic
  payloads; the *verified* side is anchored to **scores** (`validate_stat`).
- `validate_stat` **returns a bool, it doesn't assert** — a confirmed tx means
  *authentic*, not *true*.
- Scores stream/snapshot responses are **PascalCase**; stat-validation is
  camelCase.
- The free devnet tier is **60-seconds delayed** — fine for signal windows of
  tens of seconds to minutes.

---

## Setup

Requires Node 18+ and pnpm. Runs on **devnet**.

```bash
pnpm install                 # installs txline-anchor from git (builds on install)
cp .env.example .env         # then fill in WALLET_SECRET_KEY (funded devnet wallet)
```

Fund the wallet with a little devnet SOL for the one-time subscribe tx:

```bash
solana airdrop 1 <YOUR_WALLET_PUBKEY> --url devnet
```

### `.env`

| Var | Meaning |
|---|---|
| `WALLET_SECRET_KEY` | base58 64-byte secret of a funded devnet wallet |
| `SIDEFOOT_NETWORK` | `devnet` (default) or `mainnet` |
| `SIDEFOOT_FIXTURES` | comma-separated fixture ids to track; blank = all |
| `SIDEFOOT_DATA_DIR` | where replay captures are written (default `./data`) |
| `ANTHROPIC_*` | reasoning-layer config; unused until Day 6 |

---

## Run

```bash
pnpm ingest    # console demo: prints normalized odds ticks + score events live
pnpm record    # background recorder: appends raw SSE frames to data/*.jsonl
pnpm test      # unit tests (no network)
pnpm build     # emit dist/
```

The first run does a one-time on-chain `subscribe` + token activation and caches
the session to `.session.json` (gitignored), so later runs reuse it instead of
re-subscribing.

### Replay dataset

`pnpm record` captures every raw odds/scores frame — with local receipt time and
the original SSE envelope — one JSON object per line:

```json
{ "feed": "scores", "receivedAt": "…", "id": "…", "data": { "FixtureId": …, "Seq": …, "Stats": {…} } }
```

Recording from Day 3 onward means the detector can be tuned, and the demo's hook
moment replayed deterministically, without depending on a live match cooperating
on recording day.

---

## Architecture (functional core / imperative shell)

```
src/
├── env.ts             env → typed config (the only reader of process.env)
├── types.ts           domain types: OddsTick, ScoreEvent, VerifiedSignal, DivergenceSignal
├── normalize.ts       PURE: OddsPayload → OddsTick[], Scores → ScoreEvent[]
├── session.ts         auth → subscribe → activate, cached to .session.json
├── ingest/
│   ├── worker.ts      wires streamOdds + streamScores; reconnect + backoff; fan-out
│   └── recorder.ts    append-only JSONL replay recorder
├── recordReplay.ts    `pnpm record` entrypoint (background dataset capture)
├── runIngest.ts       `pnpm ingest` entrypoint (live console demo)
└── index.ts           library surface
```

`normalize.ts` and (Day 4) the detector are the pure, fully unit-tested core; the
SSE connections and RPC calls are the imperative shell around them.
