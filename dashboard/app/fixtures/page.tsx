"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadFixtures, type FixturesBoardData } from "../../lib/fixtures";
import { loadFeed } from "../../lib/feed";
import { Wordmark } from "../../components/Wordmark";
import { FixturesBoard } from "../../components/FixturesBoard";

export default function FixturesPage() {
  const [data, setData] = useState<FixturesBoardData | null>(null);
  const [captured, setCaptured] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      loadFixtures()
        .then((d) => active && (setData(d), setError(null)))
        .catch((e) => active && setError(String(e?.message ?? e)));
      // Which fixtures the live board actually has data for.
      loadFeed()
        .then((f) => active && setCaptured(new Set(f.fixtures.map((x) => x.fixtureId))))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 90_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-0 pitch-lines" />
      <div className="grain" />

      <main className="relative mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-2 font-mono text-xs">
            {data && (
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-muted">{data.network}</span>
            )}
            <Link href="/dashboard" className="rounded-full border border-line bg-panel px-2 py-0.5 text-muted hover:text-ink">
              live board →
            </Link>
          </nav>
        </header>

        <div className="mb-6">
          <p className="kicker">TxLINE fixtures</p>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-tight sm:text-4xl">Fixtures board</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Every fixture on the TxLINE feed — by sport, with kickoff, status, and whether odds are trading. Tap a
            trading match to open it on the live board.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            Couldn&apos;t load fixtures.json — {error}. Run <code className="text-ink">pnpm feed</code> to generate it.
          </div>
        )}

        {data && <FixturesBoard data={data} />}

        {!data && !error && (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-line bg-panel/50" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
