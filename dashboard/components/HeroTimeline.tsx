"use client";

/**
 * The signature hero visual — a compact self-contained animation of the whole
 * thesis: odds tick along (blue), a goal is proven on-chain (green diamond, it
 * pings), Sidefoot watches the amber window, the line stays flat (the signal),
 * then the market reprices — too late.
 */
export function HeroTimeline() {
  // Odds polyline: flat ~44%, then a late jump. y grows downward in the viewBox.
  const pts = "10,150 70,148 130,152 190,150 250,148 300,150 360,149 420,120 480,70";
  const proof = { x: 250, y: 148 };

  return (
    <svg viewBox="0 0 500 240" className="h-full w-full" role="img" aria-label="Odds staying flat after a proven goal, then repricing late">
      {/* recessive grid */}
      {[40, 80, 120, 160, 200].map((y) => (
        <line key={y} x1="0" y1={y} x2="500" y2={y} stroke="#17211C" strokeWidth="1" strokeDasharray="2 5" />
      ))}

      {/* watched window */}
      <rect x="250" y="20" width="150" height="210" fill="#FF7A45" fillOpacity="0.08" stroke="#FF7A45" strokeOpacity="0.35" strokeDasharray="3 3" />
      <text x="258" y="36" fill="#FF7A45" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="1">
        SIDEFOOT WATCHING
      </text>

      {/* odds line */}
      <polyline points={pts} fill="none" stroke="#4B93FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="draw-line" />

      {/* market repriced — late */}
      <circle cx="480" cy="70" r="4" fill="#4B93FF" stroke="#070B09" strokeWidth="2" />
      <text x="480" y="58" textAnchor="end" fill="#4B93FF" fontSize="9.5" fontFamily="var(--font-mono)">
        repriced — late
      </text>

      {/* proof marker with ping */}
      <g transform={`translate(${proof.x},${proof.y})`}>
        <circle r="8" fill="#2DE38A" opacity="0.25">
          <animate attributeName="r" values="8;20;8" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <path d="M0,-7 L7,0 L0,7 L-7,0 Z" fill="#2DE38A" stroke="#070B09" strokeWidth="1.5" />
        <text x="0" y="-14" textAnchor="middle" fill="#2DE38A" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="700">
          GOAL PROVEN
        </text>
      </g>
    </svg>
  );
}
