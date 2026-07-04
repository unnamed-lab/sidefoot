import type { FixtureFeed } from "../lib/feed";

export function ScorePhaseHeader({ fixture }: { fixture: FixtureFeed }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-baseline gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {fixture.participant1} <span className="text-muted">vs</span> {fixture.participant2}
        </h2>
        {fixture.currentScore && (
          <span className="font-mono text-2xl tabular-nums text-ink">{fixture.currentScore}</span>
        )}
        <span className="rounded-full border border-border bg-white/5 px-2.5 py-0.5 text-xs text-muted">
          {fixture.gamePhase}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted">
        <Legend swatch="bg-odds" label={fixture.marketLabel} />
        <Legend swatch="bg-proof" label="Proven score (on-chain)" shape="diamond" />
        <Legend swatch="bg-signal/40" label="Watched window" />
      </div>
    </div>
  );
}

function Legend({ swatch, label, shape }: { swatch: string; label: string; shape?: "diamond" }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 ${swatch} ${shape === "diamond" ? "rotate-45" : "rounded-sm"}`} />
      {label}
    </span>
  );
}
