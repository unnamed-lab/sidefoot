import { config as loadDotenv } from "dotenv";
import type { Network } from "txline-anchor";

loadDotenv();

/**
 * Runtime configuration, read once from the environment (`.env` in dev).
 *
 * Kept deliberately thin: this is the only place the process reaches for
 * `process.env`, so the rest of the codebase takes plain values and stays
 * testable without touching the environment.
 */
export interface SidefootEnv {
  walletSecretKey: string;
  network: Network;
  /** Fixture ids to track; empty means "all fixtures". */
  fixtures: number[];
  dataDir: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

function parseNetwork(v: string | undefined): Network {
  if (v === "mainnet") return "mainnet";
  if (v === "devnet" || v === undefined || v === "") return "devnet";
  throw new Error(`SIDEFOOT_NETWORK must be "devnet" or "mainnet", got "${v}"`);
}

function parseFixtures(v: string | undefined): number[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) {
        throw new Error(`SIDEFOOT_FIXTURES entry "${s}" is not an integer`);
      }
      return n;
    });
}

export function loadEnv(): SidefootEnv {
  return {
    walletSecretKey: required("WALLET_SECRET_KEY"),
    network: parseNetwork(process.env.SIDEFOOT_NETWORK),
    fixtures: parseFixtures(process.env.SIDEFOOT_FIXTURES),
    dataDir: process.env.SIDEFOOT_DATA_DIR ?? "./data",
  };
}

/**
 * Config for the reasoning layer. The Anthropic-compatible client honours
 * `ANTHROPIC_BASE_URL`, so this can point at Anthropic or any compatible
 * endpoint (this project's `.env` points it at DeepSeek). Loaded separately from
 * `loadEnv` so the ingestion/proving paths don't require an LLM key.
 */
export interface ReasoningConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export function loadReasoningConfig(): ReasoningConfig {
  return {
    apiKey: required("ANTHROPIC_API_KEY"),
    baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  };
}

/**
 * Config for Herald alert delivery. Sidefoot pushes confirmed signals to a
 * bettor's Telegram through Herald (the notification gateway), so the recipient
 * is a Herald-registered wallet with Telegram connected — distinct from the
 * devnet wallet Sidefoot proves stats with.
 */
export interface HeraldConfig {
  apiKey: string;
  /** Herald-registered recipient wallet (base58) with Telegram connected. */
  recipientWallet: string;
  /** Write an on-chain ZK receipt per alert (mainnet, counts against quota). */
  receipt: boolean;
  /** 'important'/'critical' add SMS fallback if the recipient has it. */
  priority: "normal" | "important" | "critical";
  category: "defi" | "governance" | "system" | "marketing" | "security";
}

function parsePriority(v: string | undefined): HeraldConfig["priority"] {
  if (v === "normal" || v === "important" || v === "critical") return v;
  return "important"; // signals are time-sensitive by nature
}

export function loadHeraldConfig(): HeraldConfig {
  return {
    apiKey: required("HERALD_API_KEY"),
    recipientWallet: required("HERALD_RECIPIENT_WALLET"),
    // Default off: alerts can be frequent and receipts hit mainnet + quota.
    receipt: process.env.HERALD_RECEIPT === "true",
    priority: parsePriority(process.env.HERALD_PRIORITY),
    category: "defi",
  };
}
