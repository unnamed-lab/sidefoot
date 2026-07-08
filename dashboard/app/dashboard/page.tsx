"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { loadFeed, type DashboardFeed } from "../../lib/feed";
import { clockTime } from "../../lib/format";
import { Wordmark } from "../../components/Wordmark";
import { FixtureSelector } from "../../components/FixtureSelector";
import { ScorePhaseHeader } from "../../components/ScorePhaseHeader";
import { DivergenceTimeline } from "../../components/DivergenceTimeline";
import { FootballLoader } from "../../components/FootballLoader";
import { SignalFeed } from "../../components/SignalFeed";

const REFRESH_MS = 90_000;

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [feed, setFeed] = useState<DashboardFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  // Function to load the feed based on current URL query param or optional ID override
  const load = (overrideId?: number | null) => {
    const paramId = overrideId !== undefined ? overrideId : (Number(new URLSearchParams(window.location.search).get("fixture")) || null);
    return loadFeed(paramId)
      .then((f) => {
        setFeed(f);
        setUpdatedAt(Date.now());
        setError(null);
        setSelectedId((prev) => {
          const desired = overrideId ?? prev ?? paramId;
          return desired && f.fixtures.some((x) => x.fixtureId === desired) ? desired : f.fixtures[0]?.fixtureId ?? null;
        });
      })
      .catch((e) => setError(String(e?.message ?? e)));
  };

  useEffect(() => {
    let active = true;
    const runLoad = () => {
      if (!active) return;
      load();
    };
    runLoad();
    const intervalId = setInterval(runLoad, REFRESH_MS);

    const handlePopState = () => {
      if (!active) return;
      const paramId = Number(new URLSearchParams(window.location.search).get("fixture")) || null;
      if (paramId) {
        setSelectedId(paramId);
        load(paramId);
      }
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleSelect = (id: number) => {
    setSelectedId(id);
    router.push(`${pathname}?fixture=${id}`);
    load(id);
  };

  const fixture = useMemo(
    () => feed?.fixtures.find((f) => f.fixtureId === selectedId) ?? feed?.fixtures[0],
    [feed, selectedId]
  );

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-0 pitch-lines" />
      <div className="grain" />

      <main className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2 font-mono text-xs">
            {feed && (
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 text-muted" title="Auto-refreshes every 90s">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-proof" />
                live · {clockTime(new Date(updatedAt).toISOString())}
              </span>
            )}
            {feed?.sample && (
              <span className="rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 text-signal">
                sample replay
              </span>
            )}
            {feed && (
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-muted">{feed.network}</span>
            )}
            <Link href="/fixtures" className="rounded-full border border-line bg-panel px-2 py-0.5 text-muted hover:text-ink">
              fixtures
            </Link>
            <Link href="/" className="rounded-full border border-line bg-panel px-2 py-0.5 text-muted hover:text-ink">
              ← home
            </Link>
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
              <FixtureSelector fixtures={feed.fixtures} selectedId={fixture.fixtureId} onSelect={handleSelect} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <section className="rounded-2xl border border-line bg-panel/80 p-4 backdrop-blur-sm">
                <ScorePhaseHeader fixture={fixture} />
                <div className="mt-4">
                  <DivergenceTimeline fixture={fixture} explorerCluster={feed.explorerCluster} />
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-panel/80 backdrop-blur-sm lg:h-[434px]">
                <SignalFeed fixture={fixture} explorerCluster={feed.explorerCluster} />
              </section>
            </div>

            <footer className="mt-5 space-y-1 font-mono text-[11px] leading-relaxed text-muted">
              <p>
                <span className="text-ink">Honest timing —</span> the “verified” timestamp is when the on-chain
                proof returned, not the raw SSE receipt. The proof round-trip is shown as evidence, never hidden.
              </p>
              <p>
                Sidefoot explains the structural signal it computed; it does not judge whether the market is “wrong”
                and is not trading advice.
                {feed.generatedAt && ` · feed ${clockTime(feed.generatedAt)}`}
              </p>
            </footer>
          </>
        )}

        {!feed && !error && (
          <FootballLoader />
        )}
      </main>
    </div>
  );
}
