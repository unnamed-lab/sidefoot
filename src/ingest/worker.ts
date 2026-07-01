import {
  streamOdds,
  streamScores,
  type OddsPayload,
  type Scores,
  type SseMessage,
  type StreamOptions,
} from "txline-anchor";
import type { Session } from "../session";
import { normalizeOdds, normalizeScores } from "../normalize";
import type { FeedKind, OddsTick, ScoreEvent } from "../types";

/**
 * The imperative shell: owns the two long-lived SSE connections, normalizes
 * every message the moment it arrives, and fans it out to handlers. It holds no
 * decision logic itself — the pure detector (Day 4) consumes the normalized
 * `OddsTick` / `ScoreEvent` streams this produces.
 *
 * Odds and scores are kept on structurally separate paths on purpose: they carry
 * different trust levels (see types.ts), and conflating them would defeat the
 * point of Sidefoot.
 */
export interface IngestionHandlers {
  /** Raw odds message (pre-normalization) — used by the replay recorder. */
  onOdds?(payload: OddsPayload, msg: SseMessage<OddsPayload>, receivedAt: string): void | Promise<void>;
  /** Raw scores message (pre-normalization) — used by the replay recorder. */
  onScores?(scores: Scores, msg: SseMessage<Scores>, receivedAt: string): void | Promise<void>;
  /** Normalized per-selection odds tick — consumed by the detector/UI. */
  onOddsTick?(tick: OddsTick): void | Promise<void>;
  /** Normalized per-stat score event — the "something changed" trigger. */
  onScoreEvent?(event: ScoreEvent): void | Promise<void>;
  /** Non-fatal stream error (a reconnect will follow). */
  onError?(feed: FeedKind, err: unknown): void;
  /** Stream (re)connected. */
  onConnect?(feed: FeedKind, fixtureId?: number): void;
}

export interface IngestionOptions {
  /** Fixture ids to track; empty means one unfiltered stream per feed. */
  fixtures?: number[];
  /** Stop everything when this fires. */
  signal: AbortSignal;
  handlers: IngestionHandlers;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((res) => {
    if (signal.aborted) return res();
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
  });
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * Consume one SSE generator with reconnect + exponential backoff. Resumes from
 * the last seen event id (SSE `Last-Event-ID`) across reconnects, and resets the
 * backoff once a stream yields successfully. Returns only when aborted.
 */
async function runStreamWithReconnect<T>(
  feed: FeedKind,
  fixtureId: number | undefined,
  make: (opts: StreamOptions) => AsyncGenerator<SseMessage<T>>,
  base: Omit<StreamOptions, "fixtureId" | "signal" | "lastEventId">,
  signal: AbortSignal,
  handlers: IngestionHandlers,
  onMessage: (msg: SseMessage<T>, receivedAt: string) => void | Promise<void>
): Promise<void> {
  let backoff = INITIAL_BACKOFF_MS;
  let lastEventId: string | undefined;

  while (!signal.aborted) {
    try {
      handlers.onConnect?.(feed, fixtureId);
      const stream = make({ ...base, fixtureId, lastEventId, signal });
      for await (const msg of stream) {
        backoff = INITIAL_BACKOFF_MS; // healthy stream — reset backoff
        if (msg.id) lastEventId = msg.id;
        await onMessage(msg, new Date().toISOString());
      }
      // Generator completed without error (server closed the stream): reconnect.
    } catch (err) {
      if (isAbort(err) || signal.aborted) return;
      handlers.onError?.(feed, err);
    }
    if (signal.aborted) return;
    await sleep(backoff, signal);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Start ingestion. Resolves when the abort signal fires and every underlying
 * stream loop has wound down. One stream pair per tracked fixture (or a single
 * unfiltered pair when no fixtures are specified).
 */
export async function startIngestion(session: Session, opts: IngestionOptions): Promise<void> {
  const { fixtures = [], signal, handlers } = opts;
  const base = { apiOrigin: session.cfg.apiOrigin, jwt: session.jwt, apiToken: session.apiToken };
  const targets: (number | undefined)[] = fixtures.length > 0 ? fixtures : [undefined];

  const loops: Promise<void>[] = [];
  for (const fixtureId of targets) {
    loops.push(
      runStreamWithReconnect<OddsPayload>(
        "odds", fixtureId, streamOdds, base, signal, handlers,
        async (msg, receivedAt) => {
          if (msg.event === "heartbeat" || msg.data === undefined) return;
          await handlers.onOdds?.(msg.data, msg, receivedAt);
          if (handlers.onOddsTick) {
            for (const tick of normalizeOdds(msg.data, receivedAt)) {
              await handlers.onOddsTick(tick);
            }
          }
        }
      )
    );
    loops.push(
      runStreamWithReconnect<Scores>(
        "scores", fixtureId, streamScores, base, signal, handlers,
        async (msg, receivedAt) => {
          if (msg.event === "heartbeat" || msg.data === undefined) return;
          await handlers.onScores?.(msg.data, msg, receivedAt);
          if (handlers.onScoreEvent) {
            for (const ev of normalizeScores(msg.data, receivedAt)) {
              await handlers.onScoreEvent(ev);
            }
          }
        }
      )
    );
  }

  await Promise.all(loops);
}
