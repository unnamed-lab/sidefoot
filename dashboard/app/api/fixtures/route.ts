import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBoard, credentialsConfigured } from "../../../lib/txline-server";

// Node runtime (fetch + fs), never cached — always a fresh TxLINE read.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20; // safeguard for slower cold starts (Pro; Hobby caps at 10)

export async function GET() {
  if (!credentialsConfigured()) {
    return NextResponse.json({ error: "TxLINE credentials not configured (TXLINE_JWT / TXLINE_API_TOKEN)" }, { status: 503 });
  }
  try {
    const board = await buildBoard();
    // Persist a fresh snapshot when the filesystem is writable (local dev);
    // silently skipped on read-only hosts (Vercel).
    try {
      await writeFile(join(process.cwd(), "public", "fixtures.json"), JSON.stringify(board, null, 2) + "\n");
    } catch {
      /* read-only fs — fine */
    }
    return NextResponse.json(board, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 502 });
  }
}
