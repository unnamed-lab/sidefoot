import { matchPhase, isLivePhase, type FixtureFeed } from "../lib/feed";

/** Scoreboard-style header: jersey-numeral score, live phase, chart legend. */
export function ScorePhaseHeader({ fixture }: { fixture: FixtureFeed }) {
  const [h, a] = (fixture.currentScore ?? "–-–").split("-");
  const phase = matchPhase(fixture.startTime, fixture.gamePhase);
  const live = isLivePhase(phase);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="max-w-[9rem] truncate font-display text-lg uppercase tracking-wide text-ink">
            {fixture.participant1}
          </span>
          <span className="flex items-center gap-2 rounded-md bg-base-2 px-3 py-1 font-mono text-2xl font-bold tabular-nums text-proof ring-1 ring-line">
            {h}
            <span className="text-muted-2">:</span>
            {a}
          </span>
          <span className="max-w-[9rem] truncate font-display text-lg uppercase tracking-wide text-ink">
            {fixture.participant2}
          </span>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
            live ? "border-proof/40 bg-proof/10 text-proof" : "border-line bg-base-2 text-muted"
          }`}
        >
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-proof" />}
          {phase}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <Legend swatch="bg-market" label={fixture.marketLabel} />
        <Legend swatch="bg-proof" label="Proven goal (on-chain)" shape="diamond" />
        <Legend swatch="bg-signal/50" label="Watched window" />
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
