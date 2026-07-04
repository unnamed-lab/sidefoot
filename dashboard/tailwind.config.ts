import type { Config } from "tailwindcss";

// Dark trading-tool palette. One categorical hue per series (dataviz):
// odds = blue, proven/verified = green, signal/lag = amber.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B0F14",
        panel: "#121821",
        "panel-2": "#0F141B",
        border: "#1E2733",
        ink: "#E6EDF3",
        muted: "#8B98A9",
        odds: "#4CA6FF",
        proof: "#35D07F",
        signal: "#FF9F45",
        danger: "#FF5C6C",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
