# Running the Sidefoot pipeline on Render

The pipeline (`pnpm start`) is a **long-running worker**, not a website. It holds
the TxLINE streams open, proves goals on-chain, and fires Herald/Telegram alerts.
It must be running **while a match is live** — a lagging-market signal only exists
for ~20s after a goal, so nothing watching = nothing caught.

`render.yaml` in the repo root is a ready Blueprint. Steps:

## 1. Prerequisites
- Repo is on GitHub (`unnamed-lab/sidefoot`) ✓
- The `WALLET_SECRET_KEY` wallet is funded on **devnet** (it pays for the
  on-chain `subscribe` + `validate_stat` transactions).

## 2. Create the worker
1. Render dashboard → **New → Blueprint**.
2. Connect the `sidefoot` repo. Render reads `render.yaml` and proposes a worker
   named **sidefoot-pipeline**.
3. Apply. The build runs `pnpm install` (installs dev deps too, for `tsx`).

## 3. Set the four secrets
In the service's **Environment** tab, fill the `sync:false` keys:

| Key | Value |
|---|---|
| `WALLET_SECRET_KEY` | your Solana wallet secret (JSON array or base58) |
| `ANTHROPIC_API_KEY` | your DeepSeek key |
| `HERALD_API_KEY` | your Herald gateway key |
| `HERALD_RECIPIENT_WALLET` | wallet that receives the Telegram alert |

The non-secret keys (network, DeepSeek base URL/model) are already in `render.yaml`.

## 4. Deploy & watch
- **Manual Deploy → Deploy latest commit.**
- Open **Logs**. The dashboard TUI auto-detects there's no terminal and falls
  back to plain lines — you'll see:
  ```
  [pipeline] live on devnet · alerts → Herald … (Telegram)
  [pipeline] connected odds
  [pipeline] connected scores
  [proof]  … ✓verified …
  [verdict] … LAGGING_MARKET …
  [signal] …
  [alert]  … → delivered …
  ```
  On Render's Linux networking the `fetch failed` reconnect spam should be gone.

## 5. Cost / timing
Background workers aren't free (~$7/mo). Since you only need it **during
matches**, **Resume** it before kickoff and **Suspend** it after full time to
keep spend near zero. (Railway / Fly.io are equivalent if you prefer.)

## 6. Optional — persist the signal log
Render's filesystem is ephemeral (resets on redeploy). To keep the
`data/signals-*.jsonl` observability log across restarts, attach a **Disk**
(e.g. mount `/var/data`) and add `SIDEFOOT_DATA_DIR=/var/data`. Not required —
the real evidence is the on-chain proof (Explorer) and the Telegram alert.

## 7. Optional — pin a single match
Set `SIDEFOOT_FIXTURES` to a comma-separated list of fixture ids to track only
those. Unset = all live fixtures.

---

**Note on the web dashboard:** this worker and the Vercel dashboard are
decoupled. The worker's job is the live on-chain proof + Telegram alert; the
dashboard reads TxLINE directly + its committed proof snapshot. If you later want
the web Signal Feed to light up live from this worker, wire the worker to POST
signals to a Vercel API route backed by a small KV store (Upstash) — a separate
follow-up, not needed for the submission.
