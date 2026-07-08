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
          style={{ animationDuration: "5s" }}
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          {/* Ball Outer Border */}
          <circle cx="50" cy="50" r="46" stroke="currentColor" fill="none" />
          
          {/* Central Pentagonal Panel (Solid fill) */}
          <polygon points="50,35 64,45 59,61 41,61 36,45" fill="currentColor" fillOpacity="0.8" />
          
          {/* Seams connecting central panel to outer boundary */}
          <line x1="50" y1="35" x2="50" y2="15" stroke="currentColor" />
          <line x1="64" y1="45" x2="83" y2="32" stroke="currentColor" />
          <line x1="59" y1="61" x2="71" y2="80" stroke="currentColor" />
          <line x1="41" y1="61" x2="29" y2="80" stroke="currentColor" />
          <line x1="36" y1="45" x2="17" y2="32" stroke="currentColor" />

          {/* Outer Pentagonal Panels (Solid fill along the curved edge) */}
          <polygon points="50,15 57,8 54,4 46,4 43,8" fill="currentColor" fillOpacity="0.8" />
          <polygon points="83,32 91,28 92,35 86,41 79,37" fill="currentColor" fillOpacity="0.8" />
          <polygon points="71,80 79,84 76,91 68,91 65,84" fill="currentColor" fillOpacity="0.8" />
          <polygon points="29,80 35,84 32,91 24,91 21,84" fill="currentColor" fillOpacity="0.8" />
          <polygon points="17,32 21,37 14,41 8,35 9,28" fill="currentColor" fillOpacity="0.8" />

          {/* Curved panels outer seams */}
          <path d="M 50 15 C 64 15 75 21 83 32" stroke="currentColor" />
          <path d="M 83 32 C 87 46 82 68 71 80" stroke="currentColor" />
          <path d="M 71 80 C 60 88 40 88 29 80" stroke="currentColor" />
          <path d="M 29 80 C 18 68 13 46 17 32" stroke="currentColor" />
          <path d="M 17 32 C 25 21 36 15 50 15" stroke="currentColor" />
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
