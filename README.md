# Sidefoot

Sidefoot watches TxLINE's live **odds** stream against TxLINE's own
cryptographically **provable score events**, and flags the moment the market
hasn't caught up to something that's already been proven true on-chain.

Every signal it raises is backed by a real on-chain `validate_stat` call a judge
can independently verify against Solana Explorer — a proof, not a claim.

> **Live:** [sidefoot.vercel.app](https://sidefoot.vercel.app) · live API:
> [`/api/fixtures`](https://sidefoot.vercel.app/api/fixtures) ·
> [`/api/feed`](https://sidefoot.vercel.app/api/feed) · submission notes in
> [SUBMISSION.md](SUBMISSION.md).
>
> **Status:** full pipeline (ingest → prove → detect → explain → alert),
> deterministic tested detector, live TxLINE dashboard + serverless API, all
> built and deployed.
>
> **Verified proof (devnet):** a real `validate_stat` proof for a goal (fixture
> 18179759, P1 goals = 2) landed on-chain and resolves on Solana Explorer —
> [`5X7PRhn…VoxcWF`](https://explorer.solana.com/tx/5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF?cluster=devnet)
> (~14s proof round-trip, surfaced as `latencyMs`). Reproduce with `pnpm prove`.

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

### The reasoning layer's boundary

Once the detector raises a structural signal, an LLM turns it into one sentence a
person can act on at a glance — and nothing more. The boundary is enforced in the
system prompt **and** in code (`assertWithinBoundary`): the model explains the
signal the detector already computed; it does **not** judge whether the market is
"wrong", speculate about *why* the odds haven't moved, or recommend a bet. A model
that ignores the prompt and returns a trade recommendation is rejected before it
reaches a user — there's a test for exactly that. This keeps every claim as strong
as what's provable, no stronger.

> The reasoning client uses the official Anthropic SDK with a `baseURL` override,
> so it targets Anthropic or any compatible endpoint. In this repo's `.env` it's
> pointed at DeepSeek (`deepseek-v4-pro`); the boundary/adversarial tests are
> provider-agnostic and run offline against a mocked port.

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
pnpm start     # the full pipeline: ingest → prove → detect → explain → alert (Herald)
pnpm ingest    # console demo: prints normalized odds ticks + score events live
pnpm record    # background recorder: appends raw SSE frames to data/*.jsonl
pnpm prove     # find a real goal and land a validate_stat proof on devnet (prints explorer link)
pnpm explain   # run the reasoning layer on a synthetic signal (needs ANTHROPIC_* in .env)
pnpm alert     # send one synthetic signal to Telegram via Herald (needs HERALD_* in .env)
pnpm test      # unit tests (no network)
pnpm build     # emit dist/
```

The **dashboard** (Next.js + Recharts) lives in [`dashboard/`](dashboard/) and
renders the pipeline's output — odds timeline, on-chain proof markers, and the
signal feed. See its [README](dashboard/README.md).

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
├── detector.ts        PURE: detectLaggingMarket over proven signals vs odds ticks
├── prover.ts          ScoreEvent → VerifiedSignal via validate_stat (injectable ports)
├── reasoning/         explainSignal: DivergenceSignal → one boundary-safe sentence
│   ├── prompt.ts      system prompt (the hard boundary) + user-payload builder
│   ├── parse.ts       strict JSON parse + assertWithinBoundary guard
│   ├── llm.ts         LlmPort over the Anthropic SDK (baseURL-overridable)
│   └── explain.ts     port → parse → boundary
├── gamePhase.ts       GameState / statKey → readable labels
├── explorer.ts        Solana Explorer tx-link helper
├── alert/
│   ├── format.ts      PURE: signal → subject + Telegram-markdown body
│   └── herald.ts      Alerter over @herald-protocol/sdk (send + delivery status)
├── pipeline.ts        SidefootPipeline: ingest→prove→window→detect→explain→alert
├── session.ts         auth → subscribe → activate, cached to .session.json
├── ingest/
│   ├── worker.ts      wires streamOdds + streamScores; reconnect + backoff; fan-out
│   └── recorder.ts    append-only JSONL replay recorder
├── recordReplay.ts    `pnpm record` entrypoint (background dataset capture)
├── runIngest.ts       `pnpm ingest` entrypoint (live console demo)
├── proveOne.ts        `pnpm prove` entrypoint (land one real devnet proof)
├── explainOne.ts      `pnpm explain` entrypoint (reasoning on a synthetic signal)
├── alertOne.ts        `pnpm alert` entrypoint (one Herald/Telegram send + poll)
├── runPipeline.ts     `pnpm start` entrypoint (full live pipeline + observability log)
└── index.ts           library surface

dashboard/             Next.js + Tailwind + Recharts single-screen demo UI
```

`normalize.ts` and `detector.ts` are the pure, fully unit-tested core; the SSE
connections, HTTP calls, and RPC/proof calls are the imperative shell around
them. `prover.ts` keeps its TxLINE HTTP + on-chain calls behind injectable ports
so its logic is unit-tested without a network or a cluster.
