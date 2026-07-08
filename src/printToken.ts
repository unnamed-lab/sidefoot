import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "./env";
import { bootstrapSession } from "./session";

/**
 * Emit the read-scoped TxLINE credentials the dashboard's API routes need
 * (guest JWT + API token — NOT the wallet). Copy the output into
 * `dashboard/.env.local` for local dev, or into the Vercel project env.
 *
 *   pnpm token >> dashboard/.env.local
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const sessionFile = resolve(process.cwd(), ".session.json");
  let jwt: string;
  let apiToken: string;
  let network: string;

  if (existsSync(sessionFile)) {
    const s = JSON.parse(readFileSync(sessionFile, "utf8")) as { jwt: string; apiToken: string; network?: string };
    jwt = s.jwt;
    apiToken = s.apiToken;
    network = s.network ?? env.network;
  } else {
    const session = await bootstrapSession(env);
    jwt = session.jwt;
    apiToken = session.apiToken;
    network = env.network;
  }

  process.stdout.write(`TXLINE_NETWORK=${network}\nTXLINE_JWT=${jwt}\nTXLINE_API_TOKEN=${apiToken}\n`);
}

main().catch((err) => {
  console.error("[token] fatal:", err?.message ?? err);
  process.exit(1);
});
