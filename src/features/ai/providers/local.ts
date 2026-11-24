import { fail, ok, type ActionResult } from "@/lib/result";
import type { AiChatResult, AiClient } from "../client";
import { DEFAULT_TIMEOUT_MS, hostOf, MSG, statusError, unreachable } from "./errors";

type Options = { timeoutMs?: number };

/** GET/POST to a local OpenAI-compatible server and parse the JSON body, mapping every failure to a Thai message. */
async function request(
  url: string,
  init: { method: "GET" | "POST"; apiKey?: string; body?: unknown },
  timeoutMs: number,
): Promise<ActionResult<unknown>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.apiKey) headers.authorization = `Bearer ${init.apiKey}`;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    // The signal also covers reading the body, so a server that stalls mid-response times out too.
    const res = await fetch(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
      redirect: "error",
    });
    if (!res.ok) return statusError(res.status);
    try {
      return ok(await res.json());
    } catch {
      if (signal.aborted) return fail(MSG.timeout);
      return fail(MSG.badBody);
    }
  } catch {
    if (signal.aborted) return fail(MSG.timeout);
    return fail(unreachable(hostOf(url)));
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

export function createLocalClient(opts: { baseUrl: string; model: string; apiKey?: string } & Options): AiClient {
  return {
    async chat({ system, user }): Promise<ActionResult<AiChatResult>> {
      const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }];
      const started = Date.now();
      const r = await request(
        joinUrl(opts.baseUrl, "chat/completions"),
        { method: "POST", apiKey: opts.apiKey, body: { model: opts.model, messages, stream: false } },
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      if (!r.ok) return r;
      const body = r.data as { model?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== "string") return fail(MSG.badBody);
      return ok({ text, model: typeof body?.model === "string" ? body.model : opts.model, ms: Date.now() - started });
    },
  };
}

/** Model ids from GET <baseUrl>/models (OpenAI format `{ data: [{ id }] }`). */
export async function listLocalModels(baseUrl: string, apiKey?: string, opts: Options = {}): Promise<ActionResult<string[]>> {
  const r = await request(joinUrl(baseUrl, "models"), { method: "GET", apiKey }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!r.ok) return r;
  const data = (r.data as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return fail(MSG.badBody);
  const ids: string[] = [];
  for (const item of data) {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return fail(MSG.badBody);
    ids.push(id);
  }
  return ok(ids);
}
