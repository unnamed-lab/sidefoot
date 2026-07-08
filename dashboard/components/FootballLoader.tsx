"use client";

import React, { useEffect, useState } from "react";

export function FootballLoader() {
  const [statusIdx, setStatusIdx] = useState(0);
  const statuses = [
    "Connecting to TxLINE consensus feed...",
    "Retrieving sports data oracle states...",
    "Fetching live game events & odds...",
    "Analyzing on-chain Merkle proofs...",
    "Building real-time divergence board...",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % statuses.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border border-line bg-panel/40 p-8 text-center backdrop-blur-md relative overflow-hidden">
      {/* Football pitch line graphic backdrop */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-x-0 top-1/2 h-[1px] bg-proof" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-proof" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-proof" />
      </div>

      <div className="relative mb-8 flex items-center justify-center">
        {/* Glow */}
        <div className="absolute -inset-4 rounded-full bg-proof/20 blur-xl animate-pulse" />
        
        {/* Spinning Ball SVG */}
        <svg
          className="relative h-20 w-20 animate-spin text-proof"
          style={{ animationDuration: "4s" }}
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
        >
          {/* Ball Outer Border */}
          <circle cx="50" cy="50" r="44" stroke="currentColor" fill="none" />
          
          {/* Inner Pentagonal seams */}
          <polygon points="50,36 62,45 57,59 43,59 38,45" fill="currentColor" fillOpacity="0.15" />
          
          <line x1="50" y1="36" x2="50" y2="6" />
          <line x1="62" y1="45" x2="91" y2="31" />
          <line x1="57" y1="59" x2="76" y2="89" />
          <line x1="43" y1="59" x2="24" y2="89" />
          <line x1="38" y1="45" x2="9" y2="31" />

          {/* Curve Panels */}
          <path d="M 50 6 A 44 44 0 0 1 91 31" strokeDasharray="3,3" />
          <path d="M 91 31 A 44 44 0 0 1 76 89" strokeDasharray="3,3" />
          <path d="M 76 89 A 44 44 0 0 1 24 89" strokeDasharray="3,3" />
          <path d="M 24 89 A 44 44 0 0 1 9 31" strokeDasharray="3,3" />
          <path d="M 9 31 A 44 44 0 0 1 50 6" strokeDasharray="3,3" />
        </svg>
      </div>

      <div className="relative z-10 space-y-3">
        <h3 className="font-display text-xl uppercase tracking-wider text-ink">
          Loading Sidefoot
        </h3>
        <p className="mx-auto max-w-sm font-mono text-xs text-muted h-6 transition-all duration-300">
          {statuses[statusIdx]}
        </p>
      </div>

      {/* Pulsing Status Bar */}
      <div className="relative mt-8 w-60 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full w-full bg-proof animate-pulse" />
      </div>
    </div>
  );
}
