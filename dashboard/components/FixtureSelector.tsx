import type { FixtureFeed } from "../lib/feed";

export function FixtureSelector({
  fixtures,
  selectedId,
  onSelect,
}: {
  fixtures: FixtureFeed[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const getStatus = (f: FixtureFeed) => {
    const start = f.startTime ? Date.parse(f.startTime) : NaN;
    if (!Number.isFinite(start)) return "scheduled";
    const now = Date.now();
    const MATCH_MS = 150 * 60_000;
    if (now >= start + MATCH_MS) return "finished";
    if (now >= start) return "live";
    return "scheduled";
  };

  const groups = [
    { title: "Live Now", items: fixtures.filter((f) => getStatus(f) === "live"), dot: "bg-proof animate-pulse" },
    { title: "Upcoming", items: fixtures.filter((f) => getStatus(f) === "scheduled"), dot: "bg-muted" },
    { title: "Finished", items: fixtures.filter((f) => getStatus(f) === "finished"), dot: "bg-muted-2" },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className={`h-1.5 w-1.5 rounded-full ${g.dot}`} />
            <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted">{g.title}</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((f) => {
              const active = f.fixtureId === selectedId;
              const hasSignal = f.signals.length > 0;
              return (
                <button
                  key={f.fixtureId}
                  onClick={() => onSelect(f.fixtureId)}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                    active
                      ? "border-proof/50 bg-proof/10 text-ink"
                      : "border-line bg-panel text-muted hover:border-proof/30 hover:text-ink"
                  }`}
                >
                  <span className="font-display uppercase tracking-wide">
                    {f.participant1} <span className="text-muted-2">v</span> {f.participant2}
                  </span>
                  {hasSignal && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-signal" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
