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
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-odds/50 bg-odds/10 text-ink"
                : "border-border bg-panel text-muted hover:border-odds/30 hover:text-ink"
            }`}
          >
            <span className="font-medium">
              {f.participant1} v {f.participant2}
            </span>
            {hasSignal && <span className="h-2 w-2 rounded-full bg-signal" title="Active signal" />}
          </button>
        );
      })}
    </div>
  );
}
