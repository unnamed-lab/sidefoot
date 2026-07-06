"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { liveStatus, type BoardFixture, type Competition, type FixtureStatus, type FixturesBoardData } from "../lib/fixtures";

const STATUS_FILTERS: { key: "all" | FixtureStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "finished", label: "Finished" },
];

function kickoff(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function FixturesBoard({ data, capturedIds = new Set() }: { data: FixturesBoardData; capturedIds?: Set<number> }) {
  const [comp, setComp] = useState<number | "all">("all");
  const [status, setStatus] = useState<"all" | FixtureStatus>("all");

  const total = useMemo(() => data.competitions.reduce((n, c) => n + c.fixtures.length, 0), [data]);
  const counts = useMemo(() => {
    const all = data.competitions.flatMap((c) => c.fixtures);
    return {
      live: all.filter((f) => liveStatus(f) === "live").length,
      trading: all.filter((f) => f.trading).length,
    };
  }, [data]);

  const competitions = useMemo(() => {
    return data.competitions
      .filter((c) => comp === "all" || c.competitionId === comp)
      .map((c) => ({ ...c, fixtures: c.fixtures.filter((f) => status === "all" || liveStatus(f) === status) }))
      .filter((c) => c.fixtures.length > 0);
  }, [data, comp, status]);

  return (
    <div>
      {/* summary */}
      <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-xs">
        <Stat label="fixtures" value={total} />
        <Stat label="live" value={counts.live} tone="proof" />
        <Stat label="trading odds" value={counts.trading} tone="market" />
        <span className="text-muted-2">· {data.competitions.length} competition(s)</span>
      </div>

      {/* sport / competition category filter */}
      <div className="mb-3">
        <p className="kicker mb-2">Sport category</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={comp === "all"} onClick={() => setComp("all")}>
            All sports
          </Chip>
          {data.competitions.map((c) => (
            <Chip key={c.competitionId} active={comp === c.competitionId} onClick={() => setComp(c.competitionId)}>
              {c.competition}
            </Chip>
          ))}
        </div>
      </div>

      {/* status filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Chip key={s.key} active={status === s.key} onClick={() => setStatus(s.key)} small>
            {s.label}
          </Chip>
        ))}
      </div>

      {competitions.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No fixtures match this filter.</p>
      ) : (
        <div className="space-y-8">
          {competitions.map((c) => (
            <CompetitionGroup key={c.competitionId} competition={c} capturedIds={capturedIds} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitionGroup({ competition, capturedIds }: { competition: Competition; capturedIds: Set<number> }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-xl uppercase tracking-wide text-ink">{competition.competition}</h3>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-xs text-muted">{competition.fixtures.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {competition.fixtures.map((f) => (
          <FixtureRow key={f.fixtureId} fixture={f} captured={capturedIds.has(f.fixtureId)} />
        ))}
      </div>
    </section>
  );
}

function FixtureRow({ fixture, captured }: { fixture: BoardFixture; captured: boolean }) {
  const st = liveStatus(fixture);
  return (
    <Link
      href={`/dashboard?fixture=${fixture.fixtureId}`}
      title={captured ? "Open on the live board" : "Not captured yet — opens the live board"}
      className={`flex items-center justify-between gap-3 rounded-xl border bg-panel px-4 py-3 transition-colors ${
        captured ? "border-proof/30 hover:border-proof/60" : "border-line hover:border-line/80"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-display text-sm uppercase tracking-wide text-ink">
          {fixture.participant1} <span className="text-muted-2">v</span> {fixture.participant2}
        </p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
          {kickoff(fixture.startTime)}
          {captured && <span className="text-proof">· on board ↗</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {fixture.score && st !== "scheduled" && (
          <span className="rounded-md bg-base-2 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-ink ring-1 ring-line">
            {fixture.score}
          </span>
        )}
        {fixture.trading && (
          <span className="rounded-full border border-market/30 bg-market/10 px-2 py-0.5 font-mono text-[10px] uppercase text-market">odds</span>
        )}
        <StatusBadge status={st} />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: FixtureStatus }) {
  if (status === "live")
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-proof/40 bg-proof/10 px-2 py-0.5 font-mono text-[10px] uppercase text-proof">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-proof" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-proof" />
        </span>
        live
      </span>
    );
  if (status === "finished")
    return <span className="rounded-full border border-line bg-base-2 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-2">FT</span>;
  return <span className="rounded-full border border-line bg-base-2 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">soon</span>;
}

function Chip({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border ${small ? "px-3 py-1 text-xs" : "px-3 py-1.5 text-sm"} font-mono transition-colors ${
        active ? "border-proof/50 bg-proof/10 text-ink" : "border-line bg-panel text-muted hover:border-proof/30 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "proof" | "market" }) {
  const color = tone === "proof" ? "text-proof" : tone === "market" ? "text-market" : "text-ink";
  return (
    <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span> <span className="text-muted">{label}</span>
    </span>
  );
}
