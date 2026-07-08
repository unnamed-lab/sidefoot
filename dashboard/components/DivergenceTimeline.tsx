"use client";

import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import type { FixtureFeed } from "../lib/feed";
import { explorerTxUrl } from "../lib/feed";
import { clockTime, pct, secs } from "../lib/format";

const C = { market: "#4B93FF", proof: "#2DE38A", signal: "#FF7A45", grid: "#17211C", axis: "#7E9188" };

/**
 * The centre timeline — implied win probability (blue) across the match.
 *
 * When kickoff time is known it uses a MATCH-CLOCK axis (0'→90' + extra time,
 * with KO / HT / FT markers), so a viewer reads the market against match time.
 * Proven score events (green diamond → validate_stat tx) and the amber window
 * Sidefoot watched sit on the same axis; flat odds across the band is the signal.
 */
export function DivergenceTimeline({ fixture, explorerCluster }: { fixture: FixtureFeed; explorerCluster: string }) {
  const kickoff = fixture.startTime ? Date.parse(fixture.startTime) : NaN;
  // Match-clock only once the match has actually started (there's in-play odds);
  // pre-match odds would otherwise map to huge negative minutes. Fall back to
  // normal time-of-day for pre-match fixtures.
  const hasInPlay = Number.isFinite(kickoff) && fixture.odds.some((o) => Date.parse(o.t) >= kickoff);
  const matchClock = Number.isFinite(kickoff) && hasInPlay;
  const toX = (iso: string) => (matchClock ? (Date.parse(iso) - kickoff) / 60_000 : Date.parse(iso));

  const data = fixture.odds.map((o) => ({ x: toX(o.t), p: o.p }));
  const wallXs = fixture.odds.map((o) => Date.parse(o.t));
  const wallRange = wallXs.length ? Math.max(...wallXs) - Math.min(...wallXs) : 0;
  const degenerate = data.length < 3 || wallRange < 60_000;

  const openTx = (sig?: string) => sig && window.open(explorerTxUrl({ explorerCluster }, sig), "_blank", "noopener");

  if (data.length === 0 || degenerate) {
    return (
      <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line text-center">
        <p className="max-w-sm text-sm text-muted">
          {data.length === 0
            ? "No live odds captured for this fixture in this window."
            : "Settled odds (finished match) — no in-play window to plot."}
        </p>
        {fixture.proofs.map((pr, i) => (
          <button
            key={i}
            onClick={() => openTx(pr.txSignature)}
            className="flex items-center gap-2 rounded-lg border border-proof/30 bg-proof/5 px-3 py-2 font-mono text-xs text-proof hover:border-proof/60"
          >
            <span className="h-2 w-2 rotate-45 bg-proof" /> {pr.statLabel} proven on-chain · {secs(pr.latencyMs)}
            {pr.txSignature ? " · verify ↗" : ""}
          </button>
        ))}
      </div>
    );
  }

  const nearestP = (x: number) => data.reduce((b, d) => (Math.abs(d.x - x) < Math.abs(b.x - x) ? d : b), data[0]!).p;
  const proofPts = fixture.proofs.map((pr) => {
    const x = toX(pr.provenAt);
    return { x, y: nearestP(x), statLabel: pr.statLabel, latencyMs: pr.latencyMs, txSignature: pr.txSignature };
  });
  const windowMin = (ms: number) => (matchClock ? ms / 60_000 : ms);
  const catchUps = fixture.signals
    .map((s) => {
      const base = nearestP(toX(s.provenAt));
      const end = toX(s.provenAt) + windowMin(s.windowMs);
      const jump = data.find((d) => d.x > end && Math.abs(d.p - base) >= 0.04);
      return jump ? { x: jump.x, y: jump.p } : null;
    })
    .filter((v): v is { x: number; y: number } => v !== null);

  const ps = data.map((d) => d.p);
  const rawMin = Math.min(...ps);
  const rawMax = Math.max(...ps);
  // Round min down to nearest 5% and max up to nearest 5% for clean axis ticks
  const lo = Math.max(0, Math.floor((rawMin - 0.02) * 20) / 20);
  const hi = Math.min(1, Math.ceil((rawMax + 0.02) * 20) / 20);


  // Axis config: match-clock (minutes) vs wall-clock (fallback).
  let xDomain: [number | string, number | string] = ["dataMin", "dataMax"];
  let xTicks: number[] | undefined;
  let xFmt = (v: number) => clockTime(new Date(v).toISOString());
  if (matchClock) {
    const maxM = Math.max(90, ...data.map((d) => d.x));
    const matchEnd = Math.min(130, Math.ceil(Math.max(90, maxM) / 15) * 15);
    const minM = Math.min(0, ...data.map((d) => d.x));
    xDomain = [Math.floor(minM), matchEnd];
    xTicks = [0, 15, 30, 45, 60, 75, 90, 105, 120].filter((t) => t <= matchEnd);
    xFmt = (v: number) => `${Math.round(v)}'`;
  }
  const tipLabel = (v: number) => (matchClock ? `${Math.round(v)}'` : clockTime(new Date(v).toISOString()));

  return (
    <div>
      <p className="mb-1 font-mono text-[11px] text-muted">
        Implied win probability · <span className="text-market">{fixture.marketLabel}</span>
        {matchClock && <span className="text-muted-2"> · match clock</span>}
      </p>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 24, right: 18, bottom: 6, left: -6 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />

            {/* Watched windows. */}
            {fixture.signals.map((s, i) => {
              const start = toX(s.provenAt);
              return (
                <ReferenceArea
                  key={`w${i}`}
                  x1={start}
                  x2={start + windowMin(s.windowMs)}
                  fill={C.signal}
                  fillOpacity={0.1}
                  stroke={C.signal}
                  strokeOpacity={0.4}
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                  label={{ value: "WATCHING", position: "insideTop", fill: C.signal, fontSize: 9, fontFamily: "var(--font-mono)", offset: 8 }}
                />
              );
            })}

            {/* Match markers: KO / HT / FT. */}
            {matchClock &&
              [
                { x: 0, label: "KO" },
                { x: 45, label: "HT" },
                { x: 90, label: "FT" },
              ].map((m) => (
                <ReferenceLine
                  key={m.label}
                  x={m.x}
                  stroke={C.grid}
                  strokeWidth={1}
                  label={{ value: m.label, position: "insideTopRight", fill: C.axis, fontSize: 9, fontFamily: "var(--font-mono)" }}
                />
              ))}

            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              {...(xTicks ? { ticks: xTicks } : { scale: "time" as const })}
              tickFormatter={xFmt}
              stroke={C.axis}
              tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickMargin={8}
              axisLine={{ stroke: C.grid }}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              domain={[lo, hi]}
              tickFormatter={(v) => pct(v, 0)}
              stroke={C.axis}
              tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
              width={52}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: C.axis, strokeDasharray: "3 3", strokeOpacity: 0.5 }}
              contentStyle={{ background: "#0B110E", border: "1px solid #1B2620", borderRadius: 10, fontSize: 12, fontFamily: "var(--font-mono)" }}
              labelStyle={{ color: "#7E9188" }}
              labelFormatter={(v) => tipLabel(v as number)}
              formatter={(value: number) => [`${pct(value, 2)} to win`, fixture.marketLabel]}
            />

            <Line
              type="monotone"
              dataKey="p"
              stroke={C.market}
              strokeWidth={2.5}
              dot={{ r: 2, fill: C.market, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: C.market, stroke: "#070B09", strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {catchUps.map((c, i) => (
              <ReferenceDot
                key={`c${i}`}
                x={c.x}
                y={c.y}
                r={4}
                fill={C.market}
                stroke="#070B09"
                strokeWidth={2}
                ifOverflow="extendDomain"
                label={{ value: "repriced — late", position: "top", fill: C.market, fontSize: 10, fontFamily: "var(--font-mono)" }}
              />
            ))}

            <Scatter
              data={proofPts}
              dataKey="y"
              isAnimationActive={false}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const r = 7;
                return (
                  <g transform={`translate(${cx},${cy})`} style={{ cursor: payload.txSignature ? "pointer" : "default" }} onClick={() => openTx(payload.txSignature)}>
                    <circle r={r + 5} fill={C.proof} opacity={0.18}>
                      <animate attributeName="r" values={`${r};${r + 9};${r}`} dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.28;0;0.28" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                    <path d={`M0,${-r} L${r},0 L0,${r} L${-r},0 Z`} fill={C.proof} stroke="#070B09" strokeWidth={1.5} />
                    <text x={0} y={-r - 8} textAnchor="middle" fill={C.proof} fontSize={10} fontFamily="var(--font-mono)" fontWeight={600}>
                      GOAL PROVEN
                    </text>
                    <title>{`Proven: ${payload.statLabel} — proof round-trip ${secs(payload.latencyMs)}${payload.txSignature ? " (click to verify on Explorer)" : ""}`}</title>
                  </g>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
