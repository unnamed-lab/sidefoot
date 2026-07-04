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
  ResponsiveContainer,
} from "recharts";
import type { FixtureFeed } from "../lib/feed";
import { explorerTxUrl } from "../lib/feed";
import { clockTime, pct, secs } from "../lib/format";

/**
 * The centre timeline: odds plotted continuously (blue), each proven score event
 * marked at the instant its on-chain proof landed (green diamond → links to the
 * validate_stat tx on Solana Explorer), and the window Sidefoot watched shaded
 * amber. When the odds line stays flat across an amber band, that's the signal:
 * the market lagged a proof.
 */
export function DivergenceTimeline({
  fixture,
  explorerCluster,
}: {
  fixture: FixtureFeed;
  explorerCluster: string;
}) {
  const oddsData = fixture.odds.map((o) => ({ x: Date.parse(o.t), p: o.p }));

  const nearestP = (epoch: number): number => {
    let best = oddsData[0];
    for (const d of oddsData) if (Math.abs(d.x - epoch) < Math.abs(best.x - epoch)) best = d;
    return best?.p ?? 0;
  };

  const proofData = fixture.proofs.map((pr) => {
    const epoch = Date.parse(pr.provenAt);
    return {
      x: epoch,
      y: nearestP(epoch),
      statLabel: pr.statLabel,
      latencyMs: pr.latencyMs,
      txSignature: pr.txSignature,
    };
  });

  const ps = oddsData.map((d) => d.p);
  const lo = Math.max(0, Math.min(...ps) - 0.03);
  const hi = Math.min(1, Math.max(...ps) + 0.03);

  const openTx = (sig?: string) => {
    if (sig) window.open(explorerTxUrl({ explorerCluster }, sig), "_blank", "noopener");
  };

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={oddsData} margin={{ top: 16, right: 16, bottom: 8, left: -8 }}>
          <CartesianGrid stroke="#1E2733" strokeDasharray="3 3" vertical={false} />

          {/* Windows Sidefoot watched (provenAt → provenAt + windowMs). */}
          {fixture.signals.map((s, i) => {
            const start = Date.parse(s.provenAt);
            return (
              <ReferenceArea
                key={i}
                x1={start}
                x2={start + s.windowMs}
                fill="#FF9F45"
                fillOpacity={0.12}
                stroke="#FF9F45"
                strokeOpacity={0.35}
                ifOverflow="extendDomain"
              />
            );
          })}

          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={(v) => clockTime(new Date(v).toISOString())}
            stroke="#8B98A9"
            fontSize={11}
            tickMargin={8}
          />
          <YAxis
            domain={[lo, hi]}
            tickFormatter={(v) => pct(v, 0)}
            stroke="#8B98A9"
            fontSize={11}
            width={52}
          />
          <Tooltip
            contentStyle={{ background: "#0F141B", border: "1px solid #1E2733", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#8B98A9" }}
            labelFormatter={(v) => clockTime(new Date(v as number).toISOString())}
            formatter={(value: number) => [pct(value, 2), fixture.marketLabel]}
          />

          <Line
            type="monotone"
            dataKey="p"
            stroke="#4CA6FF"
            strokeWidth={2}
            dot={{ r: 2, fill: "#4CA6FF" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />

          {/* Proof markers — green diamonds, click to verify on Explorer. */}
          <Scatter
            data={proofData}
            dataKey="y"
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const r = 7;
              return (
                <g
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: payload.txSignature ? "pointer" : "default" }}
                  onClick={() => openTx(payload.txSignature)}
                >
                  <path
                    d={`M0,${-r} L${r},0 L0,${r} L${-r},0 Z`}
                    fill="#35D07F"
                    stroke="#0B0F14"
                    strokeWidth={1.5}
                  />
                  <title>
                    {`Proven: ${payload.statLabel} — proof round-trip ${secs(payload.latencyMs)}` +
                      (payload.txSignature ? " (click to verify on Explorer)" : "")}
                  </title>
                </g>
              );
            }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
