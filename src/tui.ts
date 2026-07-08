import * as readline from "node:readline";

/**
 * A tiny, dependency-free terminal dashboard for the live pipeline.
 *
 * When stdout is a TTY it takes over the alternate screen and paints a
 * self-refreshing "Matchday Terminal": header + stream status + live counters +
 * a rolling colour-coded event feed + a key hints footer. Keys: [q] quit,
 * [c] clear feed, [space] freeze/follow.
 *
 * When stdout is NOT a TTY (piped to a file, CI) it degrades to the plain
 * `[kind] …` log lines it always emitted, so redirected output stays scriptable.
 */

// ── Matchday palette (truecolor) ────────────────────────────────────────────
const paint = (r: number, g: number, b: number, bold = false) => (s: string) =>
  `\x1b[${bold ? "1;" : ""}38;2;${r};${g};${b}m${s}\x1b[0m`;
const market = paint(75, 147, 255);
const marketB = paint(75, 147, 255, true);
const proof = paint(45, 227, 138);
const proofB = paint(45, 227, 138, true);
const signal = paint(255, 122, 69);
const signalB = paint(255, 122, 69, true);
const ink = paint(226, 232, 240);
const inkB = paint(226, 232, 240, true);
const muted = paint(138, 148, 163);
const dim = paint(92, 100, 116);
const danger = paint(255, 92, 97);
const warn = paint(240, 190, 80);
const B = dim; // borders

type Tone = "proof" | "signal" | "market" | "muted" | "danger" | "warn" | "ink";
const TONE: Record<Tone, { c: (s: string) => string; cb: (s: string) => string }> = {
  proof: { c: proof, cb: proofB },
  signal: { c: signal, cb: signalB },
  market: { c: market, cb: marketB },
  muted: { c: muted, cb: muted },
  danger: { c: danger, cb: danger },
  warn: { c: warn, cb: warn },
  ink: { c: ink, cb: inkB },
};
const GLYPH: Record<string, string> = {
  PROOF: "✓", VERDICT: "▲", SIGNAL: "◆", ALERT: "→",
  ERROR: "✕", LINK: "●", INFO: "·", START: "»",
};

// ── ANSI-aware layout helpers (segments carry their own colour + reset) ──────
type Seg = { t: string; c?: (s: string) => string };
const seg = (t: string, c?: (s: string) => string): Seg => ({ t, c });

function renderSegs(segs: Seg[], maxW: number): { str: string; len: number } {
  let out = "";
  let len = 0;
  for (const s of segs) {
    if (len >= maxW) break;
    let arr = [...s.t];
    const avail = maxW - len;
    if (arr.length > avail) {
      arr = arr.slice(0, Math.max(0, avail - 1));
      arr.push("…");
    }
    const t = arr.join("");
    len += [...t].length;
    out += s.c ? s.c(t) : t;
  }
  return { str: out, len };
}

export type FeedEntry = { time: string; label: string; text: string; tone: Tone };

export interface Dashboard {
  readonly isTTY: boolean;
  tick(stream: "odds" | "scores"): void;
  setStream(stream: "odds" | "scores", up: boolean): void;
  event(label: string, text: string, tone: Tone): void;
  note(text: string): void;
  stop(reason?: string): void;
}

export interface DashboardInit {
  network: string;
  logPath: string;
  recipient?: string;
  tracking: string;
  window: number;
  minShift: number;
  onQuit: () => void;
}

export function createDashboard(init: DashboardInit): Dashboard {
  const isTTY = Boolean(process.stdout.isTTY);
  if (!isTTY) return plainDashboard(init);

  const state = {
    counters: { odds: 0, scores: 0, proof: 0, verdict: 0, signal: 0, alert: 0, error: 0 },
    streams: { odds: false, scores: false },
    feed: [] as FeedEntry[],
    started: Date.now(),
    follow: true,
    stopped: false,
  };

  const write = (s: string) => process.stdout.write(s);
  const clock = () => new Date().toTimeString().slice(0, 8);
  const uptime = () => {
    const s = Math.floor((Date.now() - state.started) / 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  };

  function frame(): string {
    const W = Math.min(Math.max(process.stdout.columns ?? 88, 66), 108);
    const contentW = W - 4;
    const top = B("╭" + "─".repeat(W - 2) + "╮");
    const mid = B("├" + "─".repeat(W - 2) + "┤");
    const bot = B("╰" + "─".repeat(W - 2) + "╯");

    const row = (segs: Seg[]) => {
      const r = renderSegs(segs, contentW);
      return B("│") + " " + r.str + " ".repeat(contentW - r.len) + " " + B("│");
    };
    const rowLR = (L: Seg[], R: Seg[]) => {
      const l = renderSegs(L, contentW);
      const r = renderSegs(R, Math.max(0, contentW - l.len - 1));
      const gap = contentW - l.len - r.len;
      return B("│") + " " + l.str + " ".repeat(Math.max(1, gap)) + r.str + " " + B("│");
    };

    const dot = (up: boolean): Seg => (up ? seg("●", proof) : seg("○", danger));
    const lines: string[] = [];
    lines.push(top);
    // Title bar
    lines.push(
      rowLR(
        [seg("◉ ", signalB), seg("SIDEFOOT", inkB), seg("  proof-backed market-lag radar", muted)],
        [seg(init.network.toUpperCase() + " ", marketB), seg("● ", proof), seg("LIVE", proofB)]
      )
    );
    lines.push(mid);
    // Streams + uptime + clock
    lines.push(
      rowLR(
        [seg("odds ", muted), dot(state.streams.odds), seg("   scores ", muted), dot(state.streams.scores)],
        [seg("uptime ", dim), seg(uptime() + "  ", ink), seg(clock(), muted)]
      )
    );
    lines.push(mid);
    // Counters
    const c = state.counters;
    const n = (v: number) => v.toLocaleString();
    lines.push(
      row([
        seg("TICKS ", muted), seg(n(c.odds) + "   ", marketB),
        seg("SCORES ", muted), seg(n(c.scores) + "   ", marketB),
        seg("PROOFS ", muted), seg(n(c.proof) + "   ", proofB),
        seg("VERDICTS ", muted), seg(n(c.verdict) + "   ", inkB),
        seg("SIGNALS ", muted), seg(n(c.signal) + "   ", signalB),
        seg("ALERTS ", muted), seg(n(c.alert), signalB),
      ])
    );
    lines.push(mid);
    // Feed header
    lines.push(
      rowLR(
        [seg("LIVE EVENT FEED", inkB)],
        state.follow ? [seg("▸ following", dim)] : [seg("‖ frozen", warn)]
      )
    );
    // Feed rows — sized to the terminal height
    const rows = process.stdout.rows ?? 24;
    const feedRows = Math.max(5, rows - 13);
    const slice = state.feed.slice(-feedRows);
    for (const e of slice) {
      const t = TONE[e.tone];
      lines.push(
        row([
          seg("▌", t.c),
          seg(" " + e.time + "  ", dim),
          seg((GLYPH[e.label] ?? "·") + " ", t.c),
          seg(e.label.padEnd(8), t.cb),
          seg(e.text, e.tone === "danger" ? danger : ink),
        ])
      );
    }
    for (let i = slice.length; i < feedRows; i++) lines.push(row([seg("", muted)]));
    lines.push(mid);
    // Footer
    lines.push(
      rowLR(
        [seg("[q]", inkB), seg(" quit   ", muted), seg("[c]", inkB), seg(" clear   ", muted), seg("[space]", inkB), seg(" freeze", muted)],
        [seg("log ", dim), seg("→ " + shortPath(init.logPath), muted)]
      )
    );
    lines.push(bot);
    return "\x1b[H" + lines.map((l) => l + "\x1b[K").join("\r\n") + "\x1b[J";
  }

  let timer: NodeJS.Timeout | undefined;
  const renderNow = () => {
    if (!state.stopped) write(frame());
  };

  function restore(): void {
    if (timer) clearInterval(timer);
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {
      /* ignore */
    }
    write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
  }

  // Enter alt screen, hide cursor, wire keys.
  write("\x1b[?1049h\x1b[?25l\x1b[2J");
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const onKey = (_str: string, key: readline.Key | undefined) => {
    const name = key?.name;
    if (name === "q" || (key?.ctrl && name === "c")) return dash.stop("quit");
    if (name === "c") {
      state.feed = [];
      renderNow();
    } else if (name === "space") {
      state.follow = !state.follow;
      renderNow();
    }
  };
  process.stdin.on("keypress", onKey);
  process.on("exit", restore);
  process.stdout.on("resize", renderNow);
  timer = setInterval(renderNow, 500);
  renderNow();

  const push = (label: string, text: string, tone: Tone) => {
    if (state.follow) state.feed.push({ time: clock(), label, text, tone });
    if (state.feed.length > 500) state.feed = state.feed.slice(-500);
  };

  const dash: Dashboard = {
    isTTY: true,
    tick(stream) {
      state.counters[stream]++;
    },
    setStream(stream, up) {
      state.streams[stream] = up;
      renderNow();
    },
    event(label, text, tone) {
      const key = label.toLowerCase() as keyof typeof state.counters;
      if (key in state.counters) state.counters[key]++;
      push(label, text, tone);
      renderNow();
    },
    note(text) {
      push("INFO", text, "muted");
      renderNow();
    },
    stop(reason) {
      if (state.stopped) return;
      state.stopped = true;
      process.stdin.off("keypress", onKey);
      process.stdout.off("resize", renderNow);
      restore();
      const c = state.counters;
      // Final summary on the normal screen.
      console.log(
        signalB("\n◉ SIDEFOOT") +
          muted(` — session ${reason ? "(" + reason + ") " : ""}ended after `) +
          ink(uptime())
      );
      console.log(
        muted("  ticks ") + market(c.odds.toLocaleString()) +
          muted("  scores ") + market(c.scores.toLocaleString()) +
          muted("  proofs ") + proof(String(c.proof)) +
          muted("  verdicts ") + ink(String(c.verdict)) +
          muted("  signals ") + signal(String(c.signal)) +
          muted("  alerts ") + signal(String(c.alert))
      );
      console.log(dim("  log → " + init.logPath + "\n"));
      init.onQuit();
    },
  };
  return dash;
}

// ── Non-TTY fallback: the original plain, scriptable log lines ───────────────
function plainDashboard(init: DashboardInit): Dashboard {
  return {
    isTTY: false,
    tick() {
      /* counters aren't meaningful without a live surface */
    },
    setStream(stream, up) {
      if (up) console.log(`[pipeline] connected ${stream}`);
    },
    event(label, text) {
      console.log(`[${label.toLowerCase()}] ${text}`);
    },
    note(text) {
      console.log(`[pipeline] ${text}`);
    },
    stop(reason) {
      if (reason) console.log(`[pipeline] ${reason} — stopping…`);
      console.log(`[pipeline] stopped. Log → ${init.logPath}`);
      init.onQuit();
    },
  };
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 2 ? "…/" + parts.slice(-2).join("/") : p;
}
