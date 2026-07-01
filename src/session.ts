import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Wallet, utils } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  networkConfig,
  connect,
  createClient,
  startGuestSession,
  subscribeFreeWorldCup,
  signAndActivate,
  type Network,
  type NetworkConfig,
} from "txline-anchor";
import type { SidefootEnv } from "./env";

/** The concrete `Program<Txoracle>` type `connect` yields, without naming the internal IDL type. */
export type TxoracleProgram = ReturnType<typeof connect>["program"];
/** The authed axios client `createClient` yields. */
export type TxClient = ReturnType<typeof createClient>;

/**
 * One-time bootstrap of an authenticated TxLINE session, wrapping the exact
 * txline-anchor flow (guest JWT → on-chain subscribe → activate API token) and
 * caching the result to disk.
 *
 * WHY the cache: the on-chain `subscribe` tx costs devnet SOL and buys a 4-week
 * subscription. The recorder is meant to run repeatedly (and for long stretches)
 * while capturing the replay dataset, so re-subscribing on every start would be
 * both wasteful and slow. We persist { jwt, apiToken, txSig } and reuse it until
 * the JWT nears its 30-day expiry.
 */

const SESSION_FILE = resolve(process.cwd(), ".session.json");
/** Re-bootstrap once the cached JWT is older than this (JWT lives ~30 days). */
const MAX_SESSION_AGE_MS = 25 * 24 * 60 * 60 * 1000;

interface CachedSession {
  network: Network;
  walletPubkey: string;
  jwt: string;
  apiToken: string;
  txSig: string;
  createdAt: string;
}

export interface Session {
  cfg: NetworkConfig;
  wallet: Wallet;
  program: TxoracleProgram;
  jwt: string;
  apiToken: string;
  /** Authed axios client for snapshot/validation calls. */
  client: ReturnType<typeof createClient>;
}

function walletFromSecret(secretBase58: string): Wallet {
  const secret = utils.bytes.bs58.decode(secretBase58);
  return new Wallet(Keypair.fromSecretKey(secret));
}

function readCache(): CachedSession | undefined {
  if (!existsSync(SESSION_FILE)) return undefined;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf8")) as CachedSession;
  } catch {
    return undefined;
  }
}

function cacheIsUsable(
  c: CachedSession | undefined,
  network: Network,
  walletPubkey: string
): c is CachedSession {
  if (!c) return false;
  if (c.network !== network || c.walletPubkey !== walletPubkey) return false;
  const age = Date.now() - new Date(c.createdAt).getTime();
  return age >= 0 && age < MAX_SESSION_AGE_MS;
}

function writeCache(c: CachedSession): void {
  writeFileSync(SESSION_FILE, JSON.stringify(c, null, 2));
}

export interface BootstrapOptions {
  /** Ignore any cached session and force a fresh subscribe + activate. */
  fresh?: boolean;
}

export async function bootstrapSession(
  env: SidefootEnv,
  opts: BootstrapOptions = {}
): Promise<Session> {
  const cfg = networkConfig(env.network);
  const wallet = walletFromSecret(env.walletSecretKey);
  const walletPubkey = wallet.publicKey.toBase58();
  const { program } = connect(wallet, env.network);

  const cached = opts.fresh ? undefined : readCache();
  if (cacheIsUsable(cached, env.network, walletPubkey)) {
    const client = createClient({
      apiOrigin: cfg.apiOrigin,
      jwt: cached.jwt,
      apiToken: cached.apiToken,
    });
    console.log(
      `[session] reusing cached ${env.network} session for ${walletPubkey} (created ${cached.createdAt})`
    );
    return { cfg, wallet, program, jwt: cached.jwt, apiToken: cached.apiToken, client };
  }

  // Fresh bootstrap: needs a little devnet SOL for the subscribe tx.
  const balance = await program.provider.connection.getBalance(wallet.publicKey);
  if (balance === 0) {
    throw new Error(
      `Wallet ${walletPubkey} has 0 SOL on ${env.network}. Fund it (devnet: ` +
        `solana airdrop 1 ${walletPubkey} --url devnet) before subscribing.`
    );
  }
  console.log(
    `[session] bootstrapping ${env.network} session for ${walletPubkey} ` +
      `(balance ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL)`
  );

  const jwt = await startGuestSession(cfg.apiOrigin);
  const { txSig } = await subscribeFreeWorldCup(program);
  console.log(`[session] subscribed, txSig ${txSig}`);
  const apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], wallet.payer.secretKey);
  console.log(`[session] activated API token`);

  writeCache({
    network: env.network,
    walletPubkey,
    jwt,
    apiToken,
    txSig,
    createdAt: new Date().toISOString(),
  });

  const client = createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });
  return { cfg, wallet, program, jwt, apiToken, client };
}
