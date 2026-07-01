import type { NetworkConfig } from "txline-anchor";

/**
 * Solana Explorer link for a transaction signature on the session's cluster.
 * Every verified signal exposes one of these so a judge can independently
 * confirm the `validate_stat` proof landed — a proof, not a claim.
 */
export function explorerTxUrl(cfg: NetworkConfig, signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${cfg.explorerCluster}`;
}
