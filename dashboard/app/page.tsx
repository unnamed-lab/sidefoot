import Link from "next/link";
import { Wordmark } from "../components/Wordmark";
import { HeroTimeline } from "../components/HeroTimeline";

const TX = "5X7PRhnVRjXG3qsxnkqZEfrpcVU8Ro8825Shbsip7zYNCxCJ3Uy6Yg7arpSQk9A1qruWy6MKWkGnrJR2W1VoxcWF";
const TX_URL = `https://explorer.solana.com/tx/${TX}?cluster=devnet`;
const REPO = "https://github.com/unnamed-lab/sidefoot";

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3">
          <Link href="/fixtures" className="hidden font-mono text-xs text-muted hover:text-ink sm:block">
            Fixtures
          </Link>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="hidden font-mono text-xs text-muted hover:text-ink sm:block">
            GitHub ↗
          </a>
          <Link href="/dashboard" className="btn-primary">
            Live board →
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="relative">
        <div className="pointer-events-none absolute inset-0 pitch-lines" />
        <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[420px] -translate-x-1/2 centre-circle opacity-60" />
        <div className="grain" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-16">
          <div>
            <p className="kicker animate-rise-in" style={{ animationDelay: "0ms" }}>
              Trading tools · proof-backed · on-chain
            </p>
            <h1 className="mt-4 font-display text-5xl uppercase leading-[0.92] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="block animate-rise-in" style={{ animationDelay: "60ms" }}>
                The market
              </span>
              <span className="block animate-rise-in" style={{ animationDelay: "140ms" }}>
                is slow.
              </span>
              <span className="block animate-rise-in text-proof" style={{ animationDelay: "220ms" }}>
                The proof isn&apos;t.
              </span>
            </h1>
            <p className="mt-6 max-w-lg animate-rise-in text-lg leading-relaxed text-muted" style={{ animationDelay: "300ms" }}>
              Sidefoot watches live betting odds against score events it can{" "}
              <span className="text-ink">cryptographically prove on-chain</span> — and buzzes your phone the
              instant the market hasn&apos;t caught up to a goal that&apos;s already provably true.
            </p>
            <div className="mt-8 flex animate-rise-in flex-wrap items-center gap-3" style={{ animationDelay: "380ms" }}>
              <Link href="/dashboard" className="btn-primary text-base">
                Open the live board →
              </Link>
              <a href={TX_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                See a real proof ↗
              </a>
            </div>
            <p className="mt-4 animate-rise-in font-mono text-xs text-muted-2" style={{ animationDelay: "440ms" }}>
              Every signal carries a receipt. A proof, not a claim.
            </p>
          </div>

          {/* Hero board */}
          <div className="animate-rise-in" style={{ animationDelay: "260ms" }}>
            <div className="rounded-2xl border border-line bg-panel/70 p-4 shadow-glow-market backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-muted">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-proof" /> NGA <span className="text-proof">1</span>
                  <span className="text-muted-2">:</span> <span className="text-ink">0</span> ARG
                </span>
                <span className="uppercase tracking-widest">match winner</span>
              </div>
              <div className="h-[220px]">
                <HeroTimeline />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-signal/25 bg-panel-2 px-4 py-3 shadow-glow-signal">
              <p className="text-sm text-ink">
                <span className="font-mono text-xs uppercase tracking-wider text-signal">lagging market · </span>
                goal proven, odds flat for 20s.
              </p>
              <span className="rounded-full border border-proof/40 bg-proof/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-proof">
                high
              </span>
            </div>
          </div>
        </div>

        {/* ticker strip */}
        <div className="relative border-y border-line bg-base-2/60">
          <div className="flex overflow-hidden py-3">
            <div className="flex shrink-0 animate-ticker items-center gap-8 whitespace-nowrap pr-8 font-mono text-xs text-muted-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <TickerRow key={i} />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Two feeds ───────────────────────────────────────────────────── */}
      <Section>
        <SectionHead kicker="The insight" title="Two feeds. One truth." />
        <div className="grid gap-4 md:grid-cols-2">
          <FeedCard
            tone="market"
            tag="Fast · unverified"
            title="The odds"
            body="What the market currently believes. Streams in real time — but it's just a number, and it can lag reality."
          />
          <FeedCard
            tone="proof"
            tag="Slower · provable"
            title="The score, proven"
            body="A goal, run through TxLINE's on-chain validate_stat call — a Merkle-proof-verified fact anyone can check on Solana."
          />
        </div>
        <p className="mt-6 max-w-2xl text-muted">
          When something is <span className="text-proof">provably true on-chain</span> but the{" "}
          <span className="text-market">odds haven&apos;t moved</span> — that gap is the edge. Sidefoot lives in
          exactly that gap.
        </p>
      </Section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <Section muted>
        <SectionHead kicker="The play" title="From kickoff to buzz" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Step n="01" title="Goal" body="TxLINE's live scores feed reports a goal — fast, but unverified." accent="market" />
          <Step n="02" title="Proven" body="Sidefoot proves it on-chain via validate_stat. Authentic, permanent, checkable." accent="proof" />
          <Step n="03" title="Watched" body="It watches the odds for a short window. Did the market reprice the lead?" accent="signal" />
          <Step n="04" title="Buzzed" body="If the odds stayed flat, your phone buzzes — Telegram, via Herald." accent="proof" />
        </div>
      </Section>

      {/* ── Proof, not a claim ──────────────────────────────────────────── */}
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="kicker">The difference</p>
            <h2 className="mt-3 font-display text-4xl uppercase leading-tight tracking-tight sm:text-5xl">
              A proof,
              <br />
              <span className="text-proof">not a claim.</span>
            </h2>
            <p className="mt-5 max-w-md text-muted">
              Anyone can build a feed viewer or a chatbot that <em>says</em> the market is slow. Sidefoot backs
              every signal with a real on-chain transaction — the exact <code className="text-proof">validate_stat</code>{" "}
              call that proved the goal. Tap it. Verify it yourself.
            </p>
          </div>

          {/* receipt card */}
          <a
            href={TX_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-2xl border border-line bg-panel-2 p-5 transition-all hover:border-proof/50 hover:shadow-glow"
          >
            <div className="flex items-center justify-between border-b border-dashed border-line pb-3 font-mono text-xs text-muted">
              <span className="uppercase tracking-widest">on-chain receipt</span>
              <span className="rounded-full bg-proof/10 px-2 py-0.5 text-proof">devnet · verified</span>
            </div>
            <dl className="space-y-2 py-4 font-mono text-xs">
              <ReceiptRow k="instruction" v="validate_stat" accent />
              <ReceiptRow k="stat proven" v="P1 goals" />
              <ReceiptRow k="predicate" v="value > previous (true)" />
              <ReceiptRow k="proof round-trip" v="14.06s" />
              <ReceiptRow k="slot" v="473,304,348" />
            </dl>
            <div className="flex items-center justify-between border-t border-dashed border-line pt-3">
              <span className="truncate font-mono text-[11px] text-muted">{TX.slice(0, 22)}…</span>
              <span className="font-mono text-xs text-proof group-hover:underline">verify on Explorer →</span>
            </div>
          </a>
        </div>
      </Section>

      {/* ── Built on ────────────────────────────────────────────────────── */}
      <Section muted>
        <SectionHead kicker="The stack" title="Built on primitives, not promises" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TechPill title="TxLINE / TxODDS" sub="Live odds + provable scores" />
          <TechPill title="Solana · validate_stat" sub="On-chain Merkle proof" />
          <TechPill title="Herald → Telegram" sub="The alert that buzzes" />
          <TechPill title="Claude · reasoning" sub="One honest sentence" />
        </div>
      </Section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="pointer-events-none absolute inset-0 pitch-lines opacity-70" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-proof/5 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="font-display text-4xl uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Track the match the market
            <br />
            <span className="text-proof">hasn&apos;t caught up to — yet.</span>
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn-primary text-base">
              Open the live board →
            </Link>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              Read the code ↗
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark className="!text-lg" />
          <p className="max-w-md font-mono leading-relaxed text-muted-2">
            Devnet demo. Sidefoot explains the structural signal it computes — it does not judge whether the market
            is “wrong,” and is not trading advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ── local pieces ──────────────────────────────────────────────────────── */

function Section({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <section className={`border-t border-line ${muted ? "bg-base-2/40" : ""}`}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">{children}</div>
    </section>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-8">
      <p className="kicker">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl uppercase tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

function FeedCard({ tone, tag, title, body }: { tone: "market" | "proof"; tag: string; title: string; body: string }) {
  const ring = tone === "market" ? "border-market/30 hover:border-market/50" : "border-proof/30 hover:border-proof/50";
  const dot = tone === "market" ? "bg-market" : "bg-proof";
  const text = tone === "market" ? "text-market" : "text-proof";
  return (
    <div className={`rounded-2xl border ${ring} bg-panel p-6 transition-colors`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className={`font-mono text-[11px] uppercase tracking-widest ${text}`}>{tag}</span>
      </div>
      <h3 className="font-display text-2xl uppercase tracking-wide">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}

function Step({ n, title, body, accent }: { n: string; title: string; body: string; accent: "market" | "proof" | "signal" }) {
  const text = accent === "market" ? "text-market" : accent === "proof" ? "text-proof" : "text-signal";
  return (
    <div className="group relative rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line/80">
      <div className={`font-display text-5xl leading-none tracking-tight ${text} opacity-90`}>{n}</div>
      <h3 className="mt-3 font-display text-xl uppercase tracking-wide">{title}</h3>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </div>
  );
}

function ReceiptRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={accent ? "text-proof" : "text-ink"}>{v}</dd>
    </div>
  );
}

function TechPill({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-4">
      <p className="font-display text-sm uppercase tracking-wide text-ink">{title}</p>
      <p className="mt-1 font-mono text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function TickerRow() {
  const items = [
    ["NGA 1:0 ARG", "match winner 44%", "GOAL PROVEN", "lagging market"],
    ["BRA 1:0 ESP", "match winner 70%", "GOAL PROVEN", "market repriced"],
    ["proof round-trip 14.06s", "validate_stat", "devnet"],
  ].flat();
  return (
    <>
      {items.map((t, i) => (
        <span key={i} className="flex items-center gap-8">
          <span className={t === "GOAL PROVEN" ? "text-proof" : t === "lagging market" ? "text-signal" : ""}>{t}</span>
          <span className="text-line">/</span>
        </span>
      ))}
    </>
  );
}
