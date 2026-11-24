import Anthropic from "@anthropic-ai/sdk";
import { fail, ok, type ActionResult } from "@/lib/result";
import type { AiChatResult, AiClient } from "../client";
import { DEFAULT_TIMEOUT_MS, hostOf, MSG, statusError, unreachable } from "./errors";

const HAIKU = "claude-haiku-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function mapError(e: unknown, baseURL: string | undefined): ActionResult<never> {
  // Most specific first: the timeout error is a subclass of the connection error, which is a subclass of APIError.
  if (e instanceof Anthropic.APIConnectionTimeoutError) return fail(MSG.timeout);
  if (e instanceof Anthropic.APIConnectionError) return fail(unreachable(hostOf(baseURL ?? "https://api.anthropic.com")));
  if (e instanceof Anthropic.APIError && typeof e.status === "number") return statusError(e.status);
  return fail("ผู้ให้บริการตอบข้อผิดพลาด");
}

export function createAnthropicClient(opts: { apiKey: string; model: string; baseURL?: string; timeoutMs?: number }): AiClient {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
  return {
    async chat({ system, user }): Promise<ActionResult<AiChatResult>> {
      const started = Date.now();
      const common = {
        model: opts.model,
        max_tokens: 16000,
        output_config: { effort: "low" as const },
        ...(system ? { system } : {}),
        messages: [{ role: "user" as const, content: user }],
      };
      try {
        // Haiku has no server-side fallback (a `fallbacks` list is a 400); every other model gets the default chain.
        const response =
          opts.model === HAIKU
            ? await client.messages.create(common)
            : await client.beta.messages.create({ ...common, betas: [FALLBACK_BETA], fallbacks: "default" });
        if (response.stop_reason === "refusal") return fail(MSG.refusal);
        let text = "";
        for (const block of response.content) {
          if (block.type === "text") text += block.text;
        }
        if (!text) return fail(MSG.badBody);
        return ok({ text, model: response.model, ms: Date.now() - started });
      } catch (e) {
        return mapError(e, opts.baseURL);
      }
    },
  };
}
