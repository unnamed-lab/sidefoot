import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { resolve, join } from "node:path";
import type { SseMessage } from "txline-anchor";
import type { FeedKind } from "../types";

/**
 * Append-only JSONL recorder for the raw odds + scores SSE feeds.
 *
 * The captured dataset is what lets the detector be tuned and the demo's hook
 * moment be replayed deterministically, without depending on a live match
 * cooperating on recording day (see the implementation plan's replay strategy).
 *
 * One line per raw message, preserving the local receipt time and the original
 * SSE envelope so a replayer can reconstruct exact ordering and inter-arrival
 * gaps:
 *
 *   { "feed": "scores", "receivedAt": "...", "id": "...", "event": null, "data": {...} }
 */
export interface RecordedFrame<T = unknown> {
  feed: FeedKind;
  receivedAt: string;
  id?: string;
  event?: string;
  data: T;
}

export class ReplayRecorder {
  private readonly stream: WriteStream;
  private counts: Record<FeedKind, number> = { odds: 0, scores: 0 };
  readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.stream = createWriteStream(filePath, { flags: "a" });
  }

  /**
   * Create a recorder writing to `<dir>/replay-<network>-<ISO>.jsonl`. The
   * directory is created if missing.
   */
  static open(dir: string, network: string): ReplayRecorder {
    const absDir = resolve(dir);
    mkdirSync(absDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new ReplayRecorder(join(absDir, `replay-${network}-${stamp}.jsonl`));
  }

  record<T>(feed: FeedKind, msg: SseMessage<T>, receivedAt: string): void {
    const frame: RecordedFrame<T> = {
      feed,
      receivedAt,
      ...(msg.id !== undefined ? { id: msg.id } : {}),
      ...(msg.event !== undefined ? { event: msg.event } : {}),
      data: msg.data,
    };
    this.stream.write(JSON.stringify(frame) + "\n");
    this.counts[feed]++;
  }

  get totals(): Readonly<Record<FeedKind, number>> {
    return this.counts;
  }

  async close(): Promise<void> {
    await new Promise<void>((res, rej) =>
      this.stream.end((err?: Error | null) => (err ? rej(err) : res()))
    );
  }
}
