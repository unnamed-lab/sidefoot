import type { Config } from "tailwindcss";

/**
 * "Matchday Terminal" — night-stadium dark, floodlight glow, pitch-line texture.
 * One categorical hue per series (dataviz): market = electric blue, proof =
 * pitch green (on-chain truth), signal = hot orange (the buzz).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#070B09", // night stadium
        "base-2": "#0A100D",
        panel: "#0E1512",
        "panel-2": "#0B110E",
        line: "#1B2620",
        ink: "#ECF5EF",
        muted: "#7E9188",
        "muted-2": "#556259",
        market: "#4B93FF", // odds / the market feed
        proof: "#2DE38A", // on-chain proven truth (pitch green)
        signal: "#FF7A45", // the lagging-market alert
        danger: "#FF5566",
        pitch: "#12C98A",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(45,227,138,0.35)",
        "glow-market": "0 0 50px -14px rgba(75,147,255,0.45)",
        "glow-signal": "0 0 50px -14px rgba(255,122,69,0.45)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "sweep": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        "ping-soft": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "70%,100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "ticker": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.7s cubic-bezier(0.16,1,0.3,1) both",
        sweep: "sweep 2.4s ease-in-out infinite",
        "ping-soft": "ping-soft 2s cubic-bezier(0,0,0.2,1) infinite",
        ticker: "ticker 30s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
