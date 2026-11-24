import http from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { getAiClient, listLocalModels, testAiConnection } from "@/features/ai/client";
import { createLocalClient } from "@/features/ai/providers/local";
import { createAnthropicClient } from "@/features/ai/providers/anthropic";
import { saveAiSettings } from "@/features/ai/settings";

type Seen = { method?: string; url?: string; auth?: string; body: string };
type Reply = { status: number; body: string; contentType?: string } | "hang";

let server: http.Server;
let base = "";
let seen: Seen[] = [];
let reply: Reply = { status: 200, body: "{}" };
const sockets = new Set<import("node:net").Socket>();

const ORIGINAL = process.env.SETTINGS_SECRET;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (reply === "hang") return; // accept the connection, never answer
      res.writeHead(reply.status, { "content-type": reply.contentType ?? "application/json" });
      res.end(reply.body);
    });
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((r) => server.close(r));
  if (ORIGINAL === undefined) delete process.env.SETTINGS_SECRET;
  else process.env.SETTINGS_SECRET = ORIGINAL;
  await prisma.$disconnect();
});

beforeEach(() => {
  seen = [];
  reply = { status: 200, body: "{}" };
});

async function closedPort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

const completion = (text: string) =>
  JSON.stringify({ model: "llama3:8b", choices: [{ index: 0, message: { role: "assistant", content: text } }] });

describe("local provider", () => {
  const local = (apiKey?: string, timeoutMs?: number) =>
    createLocalClient({ baseUrl: `${base}/v1`, model: "llama3", apiKey, timeoutMs });

  test("returns the reply text, posts OpenAI wire format, no Authorization without a key", async () => {
    reply = { status: 200, body: completion("พร้อมใช้งาน") };
    const r = await local().chat({ system: "sys", user: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.text).toBe("พร้อมใช้งาน");
      expect(r.data.model).toBe("llama3:8b");
      expect(r.data.ms).toBeGreaterThanOrEqual(0);
    }
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("/v1/chat/completions");
    expect(seen[0].auth).toBeUndefined();
    const sent = JSON.parse(seen[0].body);
    expect(sent.model).toBe("llama3");
    expect(sent.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);
  });

  test("sends Authorization: Bearer only when a key is set", async () => {
    reply = { status: 200, body: completion("ok") };
    await local("sk-local-1234").chat({ user: "hi" });
    expect(seen[0].auth).toBe("Bearer sk-local-1234");
  });

  test.each([
    [401, "API key ไม่ถูกต้องหรือไม่มีสิทธิ์"],
    [403, "API key ไม่ถูกต้องหรือไม่มีสิทธิ์"],
    [404, "ไม่พบ model หรือ URL ปลายทางไม่ถูกต้อง"],
    [429, "ถูกจำกัดอัตราการใช้งาน กรุณาลองใหม่"],
    [500, "ผู้ให้บริการตอบข้อผิดพลาด (500)"],
  ])("status %i maps to a Thai message", async (status, message) => {
    reply = { status, body: JSON.stringify({ error: { message: "sk-local-1234 leaked?" } }) };
    const r = await local("sk-local-1234").chat({ user: "hi" });
    expect(r).toEqual({ ok: false, error: message });
  });

  test("connection refused names the host", async () => {
    const port = await closedPort();
    const r = await createLocalClient({ baseUrl: `http://127.0.0.1:${port}/v1`, model: "m" }).chat({ user: "hi" });
    expect(r).toEqual({ ok: false, error: `เชื่อมต่อไม่สำเร็จ: ติดต่อ 127.0.0.1:${port} ไม่ได้` });
  });

  test("a server that never answers ends in the timeout message", async () => {
    reply = "hang";
    const t0 = Date.now();
    const r = await local(undefined, 300).chat({ user: "hi" });
    expect(r).toEqual({ ok: false, error: "เชื่อมต่อไม่สำเร็จ: หมดเวลา" });
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test("an unexpected body gives a Thai error, not an exception", async () => {
    reply = { status: 200, body: "<html>nope</html>", contentType: "text/html" };
    const r = await local().chat({ user: "hi" });
    expect(r.ok).toBe(false);
    reply = { status: 200, body: JSON.stringify({ choices: [] }) };
    expect((await local().chat({ user: "hi" })).ok).toBe(false);
  });
});

describe("listLocalModels", () => {
  test("returns the ids from { data: [{ id }] } and calls GET <baseUrl>/models", async () => {
    reply = { status: 200, body: JSON.stringify({ data: [{ id: "llama3" }, { id: "qwen2.5" }] }) };
    const r = await listLocalModels(`${base}/v1`, "sk-x");
    expect(r).toEqual({ ok: true, data: ["llama3", "qwen2.5"] });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("/v1/models");
    expect(seen[0].auth).toBe("Bearer sk-x");
  });

  test("a non-JSON body gives a Thai error", async () => {
    reply = { status: 200, body: "<html>not json</html>", contentType: "text/html" };
    const r = await listLocalModels(`${base}/v1`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[ก-๙]/);
  });

  test("an unexpected JSON shape gives a Thai error", async () => {
    reply = { status: 200, body: JSON.stringify({ models: "x" }) };
    expect((await listLocalModels(`${base}/v1`)).ok).toBe(false);
    reply = { status: 200, body: JSON.stringify({ data: [{ nope: 1 }] }) };
    expect((await listLocalModels(`${base}/v1`)).ok).toBe(false);
  });

  test("maps HTTP errors and an unreachable host", async () => {
    reply = { status: 401, body: "{}" };
    expect(await listLocalModels(`${base}/v1`)).toEqual({ ok: false, error: "API key ไม่ถูกต้องหรือไม่มีสิทธิ์" });
    const port = await closedPort();
    expect(await listLocalModels(`http://127.0.0.1:${port}/v1`)).toEqual({
      ok: false,
      error: `เชื่อมต่อไม่สำเร็จ: ติดต่อ 127.0.0.1:${port} ไม่ได้`,
    });
  });

  test("times out when the server never answers", async () => {
    reply = "hang";
    expect(await listLocalModels(`${base}/v1`, undefined, { timeoutMs: 300 })).toEqual({
      ok: false,
      error: "เชื่อมต่อไม่สำเร็จ: หมดเวลา",
    });
  });
});

describe("anthropic provider", () => {
  const message = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "พร้อมใช้งาน" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      ...over,
    });
  const claude = (model = "claude-haiku-5-5", timeoutMs?: number) =>
    createAnthropicClient({ apiKey: "sk-ant-test-1234", model, baseURL: base, timeoutMs });

  test("returns the text block and uses x-api-key, no temperature/budget_tokens", async () => {
    reply = { status: 200, body: message() };
    const r = await claude().chat({ system: "sys", user: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ text: "พร้อมใช้งาน", model: "claude-haiku-5-5" });
    const sent = JSON.parse(seen[0].body);
    expect(seen[0].url).toMatch(/^\/v1\/messages/);
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent.max_tokens).toBe(16000);
    expect(sent.system).toBe("sys");
    expect(sent.output_config).toEqual({ effort: "low" });
    expect(sent).not.toHaveProperty("temperature");
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("fallbacks");
  });

  test("non-haiku models use the beta endpoint with server-side fallback", async () => {
    reply = { status: 200, body: message({ model: "claude-opus-5-5" }) };
    const r = await claude("claude-opus-5-5").chat({ user: "hi" });
    expect(r.ok).toBe(true);
    const sent = JSON.parse(seen[0].body);
    expect(sent.fallbacks).toBe("default");
    expect(sent.output_config).toEqual({ effort: "low" });
    expect(sent).not.toHaveProperty("betas");
  });

  test("non-haiku request carries the beta header", async () => {
    let beta: string | string[] | undefined;
    server.once("request", (req) => (beta = req.headers["anthropic-beta"]));
    reply = { status: 200, body: message() };
    await claude("claude-sonnet-5-5").chat({ user: "hi" });
    expect(String(beta)).toContain("server-side-fallback-2026-07-01");
  });

  test("a refusal stop reason gives the refusal message", async () => {
    reply = { status: 200, body: message({ content: [], stop_reason: "refusal" }) };
    expect(await claude().chat({ user: "hi" })).toEqual({ ok: false, error: "model ปฏิเสธคำขอ" });
  });

  test("maps API errors to Thai messages", async () => {
    for (const [status, text] of [
      [401, "API key ไม่ถูกต้องหรือไม่มีสิทธิ์"],
      [403, "API key ไม่ถูกต้องหรือไม่มีสิทธิ์"],
      [404, "ไม่พบ model หรือ URL ปลายทางไม่ถูกต้อง"],
      [429, "ถูกจำกัดอัตราการใช้งาน กรุณาลองใหม่"],
      [500, "ผู้ให้บริการตอบข้อผิดพลาด (500)"],
    ] as const) {
      reply = { status, body: JSON.stringify({ type: "error", error: { type: "x", message: "sk-ant-test-1234" } }) };
      expect(await claude().chat({ user: "hi" })).toEqual({ ok: false, error: text });
    }
  });

  test("timeout and connection refused", async () => {
    reply = "hang";
    expect(await claude("claude-haiku-5-5", 300).chat({ user: "hi" })).toEqual({
      ok: false,
      error: "เชื่อมต่อไม่สำเร็จ: หมดเวลา",
    });
    const port = await closedPort();
    const r = await createAnthropicClient({ apiKey: "k", model: "claude-haiku-5-5", baseURL: `http://127.0.0.1:${port}` }).chat({
      user: "hi",
    });
    expect(r).toEqual({ ok: false, error: `เชื่อมต่อไม่สำเร็จ: ติดต่อ 127.0.0.1:${port} ไม่ได้` });
  });
});

describe("getAiClient / testAiConnection", () => {
  beforeEach(async () => {
    process.env.SETTINGS_SECRET = "providers-test-secret-123";
    await resetDb();
  });

  test("fails with ยังไม่ได้เปิดใช้ AI when disabled", async () => {
    expect(await getAiClient()).toEqual({ ok: false, error: "ยังไม่ได้เปิดใช้ AI" });
    expect(await testAiConnection()).toEqual({ ok: false, error: "ยังไม่ได้เปิดใช้ AI" });
  });

  test("with saved local settings, the client and the connection test reach the fake server", async () => {
    await saveAiSettings({
      enabled: true,
      provider: "local",
      baseUrl: `${base}/v1`,
      model: "llama3",
      apiKey: "sk-saved-wxyz",
      clearKey: false,
    });
    reply = { status: 200, body: completion("พร้อมใช้งาน") };
    const r = await testAiConnection();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.text).toBe("พร้อมใช้งาน");
    expect(seen[0].auth).toBe("Bearer sk-saved-wxyz");
    expect(JSON.parse(seen[0].body).messages.at(-1).content).toBe('ตอบคำว่า "พร้อมใช้งาน" เท่านั้น');
  });

  test("an unreadable stored key is reported, not thrown", async () => {
    await saveAiSettings({ enabled: true, provider: "local", baseUrl: `${base}/v1`, model: "m", apiKey: "sk-saved-wxyz", clearKey: false });
    process.env.SETTINGS_SECRET = "changed-secret-0123456789";
    const r = await getAiClient();
    expect(r).toEqual({ ok: false, error: "API key เดิมอ่านไม่ได้ (SETTINGS_SECRET เปลี่ยน) กรุณาตั้งใหม่" });
  });
});
