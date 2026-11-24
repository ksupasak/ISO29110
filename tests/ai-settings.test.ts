import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { CLAUDE_MODELS, getAiSettingsView, saveAiSettings, type AiSettingsInput } from "@/features/ai/settings";

const ORIGINAL = process.env.SETTINGS_SECRET;
const SECRET = "ai-settings-test-secret-123";
const NO_SECRET_ERROR = "ยังไม่ได้ตั้งค่า SETTINGS_SECRET ที่ server จึงบันทึก API key ไม่ได้";

const base: AiSettingsInput = {
  enabled: false,
  provider: "local",
  baseUrl: "http://192.168.1.50:11434/v1",
  model: "llama3",
  apiKey: "",
  clearKey: false,
};

beforeEach(async () => {
  process.env.SETTINGS_SECRET = SECRET;
  await resetDb();
});
afterAll(async () => {
  if (ORIGINAL === undefined) delete process.env.SETTINGS_SECRET;
  else process.env.SETTINGS_SECRET = ORIGINAL;
  await prisma.$disconnect();
});

describe("getAiSettingsView", () => {
  test("defaults when the table is empty", async () => {
    expect(await getAiSettingsView()).toMatchObject({
      enabled: false,
      provider: "local",
      baseUrl: "",
      model: "",
      keyState: "none",
      keyHint: null,
    });
  });
});

describe("saveAiSettings", () => {
  test("local without baseUrl fails with a Thai error", async () => {
    const r = await saveAiSettings({ ...base, baseUrl: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/URL/);
  });

  test("a non-http baseUrl fails", async () => {
    expect((await saveAiSettings({ ...base, baseUrl: "ftp://x" })).ok).toBe(false);
    expect((await saveAiSettings({ ...base, baseUrl: "not a url" })).ok).toBe(false);
  });

  test("strips trailing slashes", async () => {
    const r = await saveAiSettings({ ...base, baseUrl: "http://host:11434/v1/" });
    expect(r.ok && r.data.baseUrl).toBe("http://host:11434/v1");
    expect((await getAiSettingsView()).baseUrl).toBe("http://host:11434/v1");
  });

  test("enabling requires a model", async () => {
    const r = await saveAiSettings({ ...base, enabled: true, model: "" });
    expect(r.ok).toBe(false);
  });

  test("stores the key encrypted, shows only the last 4 chars, keeps it on empty input, clears on request", async () => {
    const key = "sk-test-secretkey-abcd";
    const saved = await saveAiSettings({ ...base, apiKey: key });
    expect(saved.ok && saved.data.keyState).toBe("set");
    expect(saved.ok && saved.data.keyHint).toBe("abcd");

    const row = await prisma.setting.findUnique({ where: { key: "ai.apiKey" } });
    expect(row).not.toBeNull();
    expect(row!.value).not.toBe(key);
    expect(row!.value).not.toContain("secretkey");

    const view = await getAiSettingsView();
    const json = JSON.stringify(view);
    expect(json).not.toContain(key);
    expect(json).not.toContain(row!.value);
    expect(view.keyHint).toBe("abcd");

    const kept = await saveAiSettings({ ...base, model: "other", apiKey: "" });
    expect(kept.ok && kept.data.keyState).toBe("set");
    expect((await prisma.setting.findUnique({ where: { key: "ai.apiKey" } }))!.value).toBe(row!.value);

    const cleared = await saveAiSettings({ ...base, clearKey: true });
    expect(cleared.ok && cleared.data.keyState).toBe("none");
    expect(await prisma.setting.findUnique({ where: { key: "ai.apiKey" } })).toBeNull();
  });

  test("saving a key without SETTINGS_SECRET returns the exact error and writes nothing", async () => {
    delete process.env.SETTINGS_SECRET;
    const r = await saveAiSettings({ ...base, apiKey: "sk-test-abcd" });
    expect(r).toEqual({ ok: false, error: NO_SECRET_ERROR });
    expect(await prisma.setting.count()).toBe(0);
  });

  test("enabling anthropic with no key fails; with a key and a listed model it works", async () => {
    const input: AiSettingsInput = { ...base, enabled: true, provider: "anthropic", baseUrl: "", model: CLAUDE_MODELS[0] };
    expect((await saveAiSettings(input)).ok).toBe(false);
    const r = await saveAiSettings({ ...input, apiKey: "sk-ant-test-wxyz" });
    expect(r.ok).toBe(true);
  });

  test("an anthropic model outside CLAUDE_MODELS fails", async () => {
    const r = await saveAiSettings({ ...base, provider: "anthropic", model: "gpt-4", apiKey: "sk-ant-test-wxyz" });
    expect(r.ok).toBe(false);
  });

  test("baseUrl is ignored for anthropic", async () => {
    const r = await saveAiSettings({ ...base, provider: "anthropic", baseUrl: "ftp://ignored", model: CLAUDE_MODELS[0], apiKey: "sk-ant-test-wxyz" });
    expect(r.ok).toBe(true);
  });

  test("nothing is written when validation fails", async () => {
    await saveAiSettings({ ...base, baseUrl: "ftp://x", apiKey: "sk-test-abcd" });
    expect(await prisma.setting.count()).toBe(0);
  });

  test("after SETTINGS_SECRET changes the key is unreadable and the view does not throw", async () => {
    await saveAiSettings({ ...base, apiKey: "sk-test-secretkey-abcd" });
    process.env.SETTINGS_SECRET = "a-completely-different-secret";
    const view = await getAiSettingsView();
    expect(view.keyState).toBe("unreadable");
    expect(view.keyHint).toBeNull();
  });
});
