"use client";

import { useState } from "react";
import type { FixtureFeed, SignalItem } from "../lib/feed";
import { explorerTxUrl } from "../lib/feed";
import { clockTime, pct, secs, shortSig, confidenceClasses } from "../lib/format";

/**
 * The right-hand live signal feed. Each entry leads with the reasoning layer's
 * one-line explanation and a confidence label; a "why" expander opens the raw,
 * checkable evidence — the honest timestamps (proof time vs the raw SSE receipt),
 * the odds the detector compared, and a link to the on-chain proof itself.
 */
export function SignalFeed({
  fixture,
  explorerCluster,
}: {
  fixture: FixtureFeed;
  explorerCluster: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Signals</h3>
        <span className="text-xs text-muted">{fixture.signals.length} fired</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {fixture.signals.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No divergence yet. Sidefoot only fires when a proven score event isn&apos;t matched by
            odds movement in-window.
          </p>
        ) : (
          fixture.signals.map((s, i) => (
            <SignalCard key={i} signal={s} explorerCluster={explorerCluster} />
          ))
        )}
      </div>
    </div>
  );
}

function SignalCard({ signal, explorerCluster }: { signal: SignalItem; explorerCluster: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-panel-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-signal" />
          Lagging market · {clockTime(signal.detectedAt)}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${confidenceClasses[signal.confidence]}`}>
          {signal.confidence}
        </span>
      </div>

      <p className="text-sm leading-snug text-ink">{signal.explanation}</p>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs text-odds hover:underline"
      >
        {open ? "hide evidence" : "why?"}
      </button>

      {open && (
        <dl className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
          <Row k="Proven stat" v={signal.statLabel} />
          <Row k="Predicate proved on-chain" v={`${secs(signal.latencyMs)} round-trip`} />
          <Row k="Score event received (raw SSE)" v={clockTime(signal.scoreEventReceivedAt)} />
          <Row k="Proof landed (verified)" v={clockTime(signal.provenAt)} />
          <Row k="Market response" v={`${signal.postTickCount} update(s) in ${secs(signal.windowMs)}, max shift ${pct(signal.maxObservedShift, 2)}`} />
          {signal.txSignature && (
            <div className="pt-1">
              <a
                href={explorerTxUrl({ explorerCluster }, signal.txSignature)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-proof hover:underline"
              >
                🔗 verify proof {shortSig(signal.txSignature)} on Explorer →
              </a>
            </div>
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
