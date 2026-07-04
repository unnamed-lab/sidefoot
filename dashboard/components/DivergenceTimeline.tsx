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
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import type { FixtureFeed } from "../lib/feed";
import { explorerTxUrl } from "../lib/feed";
import { clockTime, pct, secs } from "../lib/format";

const C = { market: "#4B93FF", proof: "#2DE38A", signal: "#FF7A45", grid: "#17211C", axis: "#7E9188" };

/**
 * The centre timeline — reads the lagging-market story left to right: odds
 * (blue) tick along, a goal is PROVEN on-chain (green diamond → click to the
 * validate_stat tx), Sidefoot watches the amber window, the line stays flat
 * (the signal), and the market finally reprices — late (orange dot). Per the
 * dataviz method: one axis, recessive grid, direct labels, hover crosshair.
 */
export function DivergenceTimeline({
  fixture,
  explorerCluster,
}: {
  fixture: FixtureFeed;
  explorerCluster: string;
}) {
  const data = fixture.odds.map((o) => ({ x: Date.parse(o.t), p: o.p }));

  // Real captures can be odds-only or (pre-match) proof-only. Never crash on an
  // empty series — show an honest empty state instead (dataviz: empty-data-state).
  if (data.length === 0) {
    return (
      <div className="flex h-[340px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line text-center">
        <p className="max-w-sm text-sm text-muted">No live odds captured for this fixture in this window.</p>
        {fixture.proofs.map((pr, i) => (
          <a
            key={i}
            href={pr.txSignature ? explorerTxUrl({ explorerCluster }, pr.txSignature) : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-proof/30 bg-proof/5 px-3 py-2 font-mono text-xs text-proof hover:border-proof/60"
          >
            <span className="h-2 w-2 rotate-45 bg-proof" /> {pr.statLabel} proven on-chain · {secs(pr.latencyMs)}
            {pr.txSignature ? " · verify ↗" : ""}
          </a>
        ))}
      </div>
    );
  }

  const nearestP = (epoch: number) =>
    data.reduce((b, d) => (Math.abs(d.x - epoch) < Math.abs(b.x - epoch) ? d : b), data[0]!).p;

  const proofPts = fixture.proofs.map((pr) => ({
    x: Date.parse(pr.provenAt),
    y: nearestP(Date.parse(pr.provenAt)),
    statLabel: pr.statLabel,
    latencyMs: pr.latencyMs,
    txSignature: pr.txSignature,
  }));

  // Catch-up point: first odds tick after a watched window that jumps clear of
  // the pre-proof baseline — the market repricing, too late.
  const catchUps = fixture.signals
    .map((s) => {
      const base = nearestP(Date.parse(s.provenAt));
      const end = Date.parse(s.provenAt) + s.windowMs;
      const jump = data.find((d) => d.x > end && Math.abs(d.p - base) >= 0.04);
      return jump ? { x: jump.x, y: jump.p } : null;
    })
    .filter((v): v is { x: number; y: number } => v !== null);

  const ps = data.map((d) => d.p);
  const lo = Math.max(0, Math.min(...ps) - 0.04);
  const hi = Math.min(1, Math.max(...ps) + 0.05);
  const openTx = (sig?: string) =>
    sig && window.open(explorerTxUrl({ explorerCluster }, sig), "_blank", "noopener");

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 24, right: 18, bottom: 6, left: -6 }}>
          <defs>
            <linearGradient id="oddsGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.market} stopOpacity={0.18} />
              <stop offset="100%" stopColor={C.market} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />

          {fixture.signals.map((s, i) => {
            const start = Date.parse(s.provenAt);
            return (
              <ReferenceArea
                key={i}
                x1={start}
                x2={start + s.windowMs}
                fill={C.signal}
                fillOpacity={0.1}
                stroke={C.signal}
                strokeOpacity={0.4}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
                label={{
                  value: "SIDEFOOT WATCHING",
                  position: "insideTop",
                  fill: C.signal,
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  offset: 8,
                }}
              />
            );
          })}

          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(v) => clockTime(new Date(v).toISOString())}
            stroke={C.axis}
            tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickMargin={8}
            axisLine={{ stroke: C.grid }}
            tickLine={false}
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
            contentStyle={{
              background: "#0B110E",
              border: "1px solid #1B2620",
              borderRadius: 10,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
            labelStyle={{ color: "#7E9188" }}
            labelFormatter={(v) => clockTime(new Date(v as number).toISOString())}
            formatter={(value: number) => [pct(value, 2), fixture.marketLabel]}
          />

          <Line type="monotone" dataKey="p" stroke="url(#oddsGlow)" strokeWidth={10} dot={false} isAnimationActive={false} legendType="none" />
          <Line
            type="monotone"
            dataKey="p"
            stroke={C.market}
            strokeWidth={2.5}
            dot={{ r: 2, fill: C.market, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: C.market, stroke: "#070B09", strokeWidth: 2 }}
            isAnimationActive={false}
          />

          {/* Market repriced — late. */}
          {catchUps.map((c, i) => (
            <ReferenceDot
              key={i}
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

          {/* Proof markers — click to verify on Explorer. */}
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
  );
}
