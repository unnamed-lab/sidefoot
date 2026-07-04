"use client";

import { useEffect, useMemo, useState } from "react";
import { loadFeed, type DashboardFeed } from "../lib/feed";
import { clockTime } from "../lib/format";
import { FixtureSelector } from "../components/FixtureSelector";
import { ScorePhaseHeader } from "../components/ScorePhaseHeader";
import { DivergenceTimeline } from "../components/DivergenceTimeline";
import { SignalFeed } from "../components/SignalFeed";

export default function Page() {
  const [feed, setFeed] = useState<DashboardFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    loadFeed()
      .then((f) => {
        setFeed(f);
        setSelectedId(f.fixtures[0]?.fixtureId ?? null);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const fixture = useMemo(
    () => feed?.fixtures.find((f) => f.fixtureId === selectedId) ?? feed?.fixtures[0],
    [feed, selectedId]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sidefoot<span className="text-odds">.</span>
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted">
            Flags the moment odds lag a{" "}
            <span className="text-ink">Merkle-proof-verified</span> score event — every signal is
            anchored to a real on-chain <code className="text-proof">validate_stat</code> call.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {feed?.sample && (
            <span className="rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-signal">
              sample replay
            </span>
          )}
          {feed && (
            <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-muted">
              {feed.network}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Couldn&apos;t load feed.json — {error}
        </div>
      )}

      {feed && fixture && (
        <>
          <div className="mb-4">
            <FixtureSelector
              fixtures={feed.fixtures}
              selectedId={fixture.fixtureId}
              onSelect={setSelectedId}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="rounded-xl border border-border bg-panel p-4">
              <ScorePhaseHeader fixture={fixture} />
              <div className="mt-4">
                <DivergenceTimeline fixture={fixture} explorerCluster={feed.explorerCluster} />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-panel lg:h-[420px]">
              <SignalFeed fixture={fixture} explorerCluster={feed.explorerCluster} />
            </section>
          </div>

          <footer className="mt-5 space-y-1 text-xs text-muted">
            <p>
              <span className="text-ink">Honest timing:</span> the “verified” timestamp is when the
              on-chain proof returned — not the raw SSE receipt. The proof round-trip is shown as
              evidence, never hidden.
            </p>
            <p>
              Sidefoot explains the structural signal it computed. It does not judge whether the
              market is “wrong” and is not trading advice.
              {feed.generatedAt && ` · feed generated ${clockTime(feed.generatedAt)}`}
            </p>
          </footer>
        </>
      )}

      {!feed && !error && <p className="text-sm text-muted">Loading feed…</p>}
    </main>
  );
}
