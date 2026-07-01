import Anthropic from "@anthropic-ai/sdk";
import type { ReasoningConfig } from "../env";

/**
 * The single IO boundary of the reasoning layer: turn a (system, user) prompt
 * pair into raw model text. Everything else in the layer is pure and testable
 * without a network by injecting a fake port.
 *
 * The concrete port uses the official Anthropic SDK. Because the SDK honours a
 * `baseURL` override, the exact same code talks to Anthropic or any
 * Anthropic-compatible endpoint — this project's `.env` points it at DeepSeek.
 * The request is kept deliberately minimal (model, max_tokens, system, one user
 * message) so it works across providers that don't implement Anthropic-only
 * extras like `thinking`/`effort`/structured-output configs.
 */
export interface LlmPort {
  complete(system: string, user: string): Promise<string>;
}

/** How many tokens a one-sentence explanation could ever need. */
const MAX_TOKENS = 300;

export function createAnthropicPort(cfg: ReasoningConfig): LlmPort {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
  });

  return {
    async complete(system: string, user: string): Promise<string> {
      const res = await client.messages.create({
        model: cfg.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    },
  };
}
