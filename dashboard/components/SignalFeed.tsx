"use client";

import { useState } from "react";
import type { FixtureFeed, SignalItem } from "../lib/feed";
import { explorerTxUrl } from "../lib/feed";
import { clockTime, pct, secs, shortSig, confidenceClasses } from "../lib/format";

/**
 * The live signal feed. Each entry leads with the reasoning layer's one-line
 * explanation + a confidence label; the "why" expander opens the raw, checkable
 * evidence — the honest raw-SSE-vs-proof timestamps, the odds compared, and a
 * link to the on-chain proof.
 */
export function SignalFeed({ fixture, explorerCluster }: { fixture: FixtureFeed; explorerCluster: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="kicker text-ink">Signal feed</h3>
        <span className="rounded-full bg-base-2 px-2 py-0.5 font-mono text-xs text-muted ring-1 ring-line">
          {fixture.signals.length} fired
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {fixture.signals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="text-2xl">🟢</span>
            <p className="max-w-[15rem] text-sm text-muted">
              Market&apos;s keeping pace. Sidefoot only fires when a proven goal isn&apos;t matched by
              odds movement in-window.
            </p>
          </div>
        ) : (
          fixture.signals.map((s, i) => <SignalCard key={i} signal={s} explorerCluster={explorerCluster} />)
        )}
      </div>
    </div>
  );
}

function SignalCard({ signal, explorerCluster }: { signal: SignalItem; explorerCluster: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="animate-rise-in rounded-xl border border-signal/25 bg-panel-2 p-3 shadow-glow-signal">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-signal">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          Lagging market · {clockTime(signal.detectedAt)}
        </span>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${confidenceClasses[signal.confidence]}`}>
          {signal.confidence}
        </span>
      </div>

      <p className="text-[15px] leading-snug text-ink">{signal.explanation}</p>

      <button onClick={() => setOpen((v) => !v)} className="mt-2 font-mono text-xs text-market hover:underline">
        {open ? "− hide evidence" : "+ why?"}
      </button>

      {open && (
        <dl className="mt-2 space-y-1 border-t border-line pt-2 font-mono text-xs">
          <Row k="Proven stat" v={signal.statLabel} />
          <Row k="Proof round-trip" v={secs(signal.latencyMs)} />
          <Row k="Score received (raw SSE)" v={clockTime(signal.scoreEventReceivedAt)} />
          <Row k="Proof landed (verified)" v={clockTime(signal.provenAt)} />
          <Row k="Market response" v={`${signal.postTickCount} in ${secs(signal.windowMs)}, max ${pct(signal.maxObservedShift, 2)}`} />
          {signal.txSignature && (
            <a
              href={explorerTxUrl({ explorerCluster }, signal.txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-proof hover:underline"
            >
              🔗 verify {shortSig(signal.txSignature)} on Explorer →
            </a>
          )}
        </dl>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
