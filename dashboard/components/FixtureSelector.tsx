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
  return (
    <div className="flex flex-wrap gap-2">
      {fixtures.map((f) => {
        const active = f.fixtureId === selectedId;
        const hasSignal = f.signals.length > 0;
        return (
          <button
            key={f.fixtureId}
            onClick={() => onSelect(f.fixtureId)}
            className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
              active
                ? "border-proof/50 bg-proof/10 text-ink"
                : "border-line bg-panel text-muted hover:border-proof/30 hover:text-ink"
            }`}
          >
            <span className="font-display text-sm uppercase tracking-wide">
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
  );
}
