import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";

// The actions call requireAdmin() (next/headers cookies) first. Mock it as a non-admin: it must reject before anything runs.
const requireAdmin = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { listLocalModelsAction, saveAiSettingsAction, testAiConnectionAction } from "@/features/ai/actions";
import { saveAiSettings } from "@/features/ai/settings";

const ORIGINAL = process.env.SETTINGS_SECRET;

beforeEach(async () => {
  process.env.SETTINGS_SECRET = "ai-actions-test-secret-123";
  await resetDb();
  requireAdmin.mockReset();
});
afterAll(async () => {
  if (ORIGINAL === undefined) delete process.env.SETTINGS_SECRET;
  else process.env.SETTINGS_SECRET = ORIGINAL;
  await prisma.$disconnect();
});

describe("non-admin cannot run the AI actions", () => {
  const notFound = new Error("NEXT_HTTP_ERROR_FALLBACK;404");

  test("all three actions reject and have no effect", async () => {
    requireAdmin.mockRejectedValue(notFound);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fd = new FormData();
    fd.set("provider", "local");
    fd.set("baseUrl", "http://127.0.0.1:1/v1");
    fd.set("model", "m");
    fd.set("apiKey", "sk-should-not-be-saved");
    await expect(saveAiSettingsAction({}, fd)).rejects.toBe(notFound);
    await expect(testAiConnectionAction()).rejects.toBe(notFound);
    await expect(listLocalModelsAction("http://127.0.0.1:1/v1", "")).rejects.toBe(notFound);
    expect(await prisma.setting.count()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("listLocalModelsAction", () => {
  test("rejects non-string arguments with a Thai error", async () => {
    requireAdmin.mockResolvedValue({ id: "a" });
    for (const args of [[42, ""], ["http://x/v1", null], [undefined, undefined], [{}, []]] as unknown[][]) {
      const r = await listLocalModelsAction(...(args as [string, string]));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/[ก-๙]/);
    }
  });

  test("does not send the stored key after a Claude save, nor to a different URL", async () => {
    requireAdmin.mockResolvedValue({ id: "a" });
    await saveAiSettings({ enabled: false, provider: "anthropic", baseUrl: "", model: "claude-opus-5-5", apiKey: "sk-ant-test-wxyz", clearKey: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: "m" }] })));
    const r = await listLocalModelsAction("http://127.0.0.1:9/v1", "");
    expect(r).toEqual({ ok: true, data: ["m"] });
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    fetchSpy.mockRestore();
  });

  test("uses the stored key only for provider local and the saved URL", async () => {
    requireAdmin.mockResolvedValue({ id: "a" });
    await saveAiSettings({ enabled: false, provider: "local", baseUrl: "http://127.0.0.1:9/v1", model: "m", apiKey: "sk-local-abcd", clearKey: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: [] })));
    const auth = (i: number) => ((fetchSpy.mock.calls[i][1] as RequestInit).headers as Record<string, string>).authorization;
    await listLocalModelsAction("http://127.0.0.1:9/v1/", "");
    expect(auth(0)).toBe("Bearer sk-local-abcd");
    await listLocalModelsAction("http://127.0.0.1:10/v1", "");
    expect(auth(1)).toBeUndefined();
    fetchSpy.mockRestore();
  });
});
