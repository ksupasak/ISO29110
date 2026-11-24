import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasSecret, open, seal } from "@/lib/secret-box";
import { fail, ok, type ActionResult } from "@/lib/result";

export type AiProvider = "local" | "anthropic";

export const CLAUDE_MODELS: readonly string[] = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-2"];

/** What the UI may see. Never carries the API key or its ciphertext. */
export type AiSettingsView = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  keyState: "none" | "set" | "unreadable";
  /** Last 4 characters of the stored key, only when keyState is "set". */
  keyHint: string | null;
};

export type AiSettingsInput = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  /** "" keeps the stored key. */
  apiKey: string;
  clearKey: boolean;
};

/** Server-side only: includes the decrypted key. Never hand this to a client component. */
export type AiConfig = Omit<AiSettingsView, "keyState" | "keyHint"> & {
  keyState: AiSettingsView["keyState"];
  apiKey: string | null;
};

export const NO_SECRET_ERROR = "ยังไม่ได้ตั้งค่า SETTINGS_SECRET ที่ server จึงบันทึก API key ไม่ได้";
export const KEY_UNREADABLE_ERROR = "API key เดิมอ่านไม่ได้ (SETTINGS_SECRET เปลี่ยน) กรุณาตั้งใหม่";

const K = {
  enabled: "ai.enabled",
  provider: "ai.provider",
  baseUrl: "ai.baseUrl",
  apiKey: "ai.apiKey",
  model: "ai.model",
} as const;

async function readRaw(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "ai." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Decrypts the stored key; distinguishes "no key" from "a key we cannot read". */
function readKey(raw: Record<string, string>): { state: AiSettingsView["keyState"]; plain: string | null } {
  const sealed = raw[K.apiKey];
  if (!sealed) return { state: "none", plain: null };
  const plain = open(sealed);
  if (plain === null || plain === "") return { state: "unreadable", plain: null };
  return { state: "set", plain };
}

function parseProvider(v: string | undefined): AiProvider {
  return v === "anthropic" ? "anthropic" : "local";
}

export async function loadAiConfig(): Promise<AiConfig> {
  const raw = await readRaw();
  const key = readKey(raw);
  return {
    enabled: raw[K.enabled] === "true",
    provider: parseProvider(raw[K.provider]),
    baseUrl: raw[K.baseUrl] ?? "",
    model: raw[K.model] ?? "",
    keyState: key.state,
    apiKey: key.plain,
  };
}

export async function getAiSettingsView(): Promise<AiSettingsView> {
  const c = await loadAiConfig();
  return {
    enabled: c.enabled,
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    keyState: c.keyState,
    keyHint: c.apiKey ? c.apiKey.slice(-4) : null,
  };
}

/** Trailing slashes stripped; null unless it parses as an http(s) URL. */
export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return trimmed.replace(/\/+$/, "");
}

export async function saveAiSettings(input: AiSettingsInput): Promise<ActionResult<AiSettingsView>> {
  const provider = parseProvider(input.provider);
  const newKey = input.clearKey ? "" : input.apiKey.trim();
  const model = input.model.trim();
  const raw = await readRaw();
  const current = readKey(raw);
  // A stored key belongs to the provider it was saved for: switching provider without typing a new key drops it.
  const providerChanged = parseProvider(raw[K.provider]) !== provider;

  if (newKey && !hasSecret()) return fail(NO_SECRET_ERROR);

  let baseUrl: string | null = null; // null = provider anthropic: the stored URL is removed
  if (provider === "local") {
    if (!input.baseUrl.trim()) return fail("กรุณากรอก URL ปลายทาง");
    baseUrl = normalizeBaseUrl(input.baseUrl);
    if (baseUrl === null) return fail("URL ปลายทางต้องเป็น http:// หรือ https:// ที่ถูกต้อง");
  }

  let finalModel = model;
  if (provider === "anthropic") {
    if (!model) finalModel = CLAUDE_MODELS[0];
    else if (!CLAUDE_MODELS.includes(model)) return fail("กรุณาเลือก model ของ Claude จากรายการ");
  } else if (input.enabled && !model) {
    return fail("กรุณาระบุ model");
  }

  const dropKey = input.clearKey || (providerChanged && !newKey);
  const keyAfter = newKey ? "set" : dropKey ? "none" : current.state;
  if (input.enabled && provider === "anthropic" && keyAfter !== "set") {
    return fail("Claude ต้องใช้ API key กรุณากรอก API key");
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [
    upsert(K.enabled, input.enabled ? "true" : "false"),
    upsert(K.provider, provider),
    upsert(K.model, finalModel),
  ];
  if (baseUrl !== null) writes.push(upsert(K.baseUrl, baseUrl));
  else writes.push(prisma.setting.deleteMany({ where: { key: K.baseUrl } }));
  if (dropKey) writes.push(prisma.setting.deleteMany({ where: { key: K.apiKey } }));
  else if (newKey) writes.push(upsert(K.apiKey, seal(newKey)));
  await prisma.$transaction(writes);

  return ok(await getAiSettingsView());
}

function upsert(key: string, value: string) {
  return prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
