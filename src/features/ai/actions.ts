"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current-user";
import { formText } from "@/lib/form";
import { fail, type ActionResult } from "@/lib/result";
import { listLocalModels, testAiConnection, type AiChatResult } from "./client";
import { loadAiConfig, normalizeBaseUrl, saveAiSettings, type AiProvider, type AiSettingsView } from "./settings";

/** The view never carries the API key, so it is safe to return to the browser. */
export type AiFormState = { error?: string; ok?: boolean; view?: AiSettingsView };

export async function saveAiSettingsAction(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  await requireAdmin();
  const provider: AiProvider = formText(formData, "provider") === "anthropic" ? "anthropic" : "local";
  const r = await saveAiSettings({
    enabled: formText(formData, "enabled") === "on",
    provider,
    baseUrl: formText(formData, "baseUrl"),
    model: formText(formData, "model"),
    apiKey: formText(formData, "apiKey"),
    clearKey: formText(formData, "clearKey") === "on",
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/ai");
  return { ok: true, view: r.data };
}

/** Tests the saved settings (not the unsaved form). */
export async function testAiConnectionAction(): Promise<ActionResult<AiChatResult>> {
  await requireAdmin();
  return testAiConnection();
}

/**
 * Lists models of the typed URL. The stored key is only used when the saved provider is local and the URL is the saved one,
 * so it is never sent to a host the admin merely typed.
 */
const listArgs = z.tuple([z.string(), z.string()]);

export async function listLocalModelsAction(baseUrl: string, typedKey: string): Promise<ActionResult<string[]>> {
  await requireAdmin();
  // Server action arguments come from the network: do not trust the TypeScript types.
  const args = listArgs.safeParse([baseUrl, typedKey]);
  if (!args.success) return fail("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  const url = normalizeBaseUrl(args.data[0]);
  if (url === null) return fail("URL ปลายทางต้องเป็น http:// หรือ https:// ที่ถูกต้อง");
  let apiKey = args.data[1].trim() || undefined;
  if (!apiKey) {
    const saved = await loadAiConfig();
    if (saved.provider === "local" && saved.apiKey && saved.baseUrl && normalizeBaseUrl(saved.baseUrl) === url) apiKey = saved.apiKey;
  }
  return listLocalModels(url, apiKey);
}
