import { NextResponse, type NextRequest } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildLiveFeed, credentialsConfigured } from "../../../lib/txline-server";
import type { DashboardFeed } from "../../../lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!credentialsConfigured()) {
    return NextResponse.json({ error: "TxLINE credentials not configured (TXLINE_JWT / TXLINE_API_TOKEN)" }, { status: 503 });
  }
  try {
    const extraId = Number(req.nextUrl.searchParams.get("fixture")) || undefined;
    // Seed from the committed snapshot so the worker's real proofs/signals survive.
    let snapshot: DashboardFeed | null = null;
    try {
      snapshot = JSON.parse(await readFile(join(process.cwd(), "public", "feed.json"), "utf8")) as DashboardFeed;
    } catch {
      /* no snapshot yet */
    }
    const feed = await buildLiveFeed(snapshot, extraId);
    try {
      await writeFile(join(process.cwd(), "public", "feed.json"), JSON.stringify(feed, null, 2) + "\n");
    } catch {
      /* read-only fs */
    }
    return NextResponse.json(feed, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 502 });
  }
}
