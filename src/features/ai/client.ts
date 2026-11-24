import { fail, ok, type ActionResult } from "@/lib/result";
import { KEY_UNREADABLE_ERROR, loadAiConfig } from "./settings";
import { createAnthropicClient } from "./providers/anthropic";
import { createLocalClient } from "./providers/local";

export type AiChatResult = { text: string; model: string; ms: number };

export interface AiClient {
  chat(input: { system?: string; user: string }): Promise<ActionResult<AiChatResult>>;
}

export { listLocalModels } from "./providers/local";

/** The one entry point for AI features: a client for the saved settings, or a Thai error. */
export async function getAiClient(): Promise<ActionResult<AiClient>> {
  const c = await loadAiConfig();
  if (!c.enabled) return fail("ยังไม่ได้เปิดใช้ AI");
  if (c.keyState === "unreadable") return fail(KEY_UNREADABLE_ERROR);
  if (!c.model) return fail("ยังไม่ได้ตั้งค่า model");
  if (c.provider === "anthropic") {
    if (!c.apiKey) return fail("Claude ต้องใช้ API key กรุณากรอก API key");
    return ok(createAnthropicClient({ apiKey: c.apiKey, model: c.model }));
  }
  if (!c.baseUrl) return fail("ยังไม่ได้ตั้งค่า URL ปลายทาง");
  return ok(createLocalClient({ baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey ?? undefined }));
}

/** Sends a fixed prompt through the saved settings. The only caller today is the admin page. */
export async function testAiConnection(): Promise<ActionResult<AiChatResult>> {
  const client = await getAiClient();
  if (!client.ok) return client;
  return client.data.chat({ user: 'ตอบคำว่า "พร้อมใช้งาน" เท่านั้น' });
}
