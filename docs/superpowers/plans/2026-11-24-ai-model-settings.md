# AI Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ADMIN-only page `/admin/ai` to configure which AI model the system uses (a local OpenAI-compatible server or Claude), plus one server-side entry point later features call.

**Architecture:** Settings live in the existing `Setting` key/value table. A service in `src/features/ai/` reads/writes them and encrypts the API key with a server secret. Two provider adapters behind one `AiClient` interface. No AI feature uses it yet; the page's "test connection" button is the only caller.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing Next code, per AGENTS.md), Prisma 6, zod, `@anthropic-ai/sdk` (new dependency), Node `crypto`, global `fetch`, Vitest (real `esm_test` DB), Playwright.

**Spec:** this document's "Design" section (approved by the user 24/11/2569 in conversation). Later consumer: AI document reading (separate design, not in this plan).

## Design (approved)

Page `/admin/ai`, ADMIN only, sidebar entry `ตั้งค่า AI` (icon `smart_toy`) under `ผู้ใช้งาน`, breadcrumb `ตั้งค่า AI`.

| Field (Thai label) | Setting key | Rules |
|---|---|---|
| `เปิดใช้ AI` (switch) | `ai.enabled` | `"true"`/`"false"`, default false |
| `ผู้ให้บริการ` (select) | `ai.provider` | `local` → label `Local / OpenAI-compatible`; `anthropic` → label `Claude (Anthropic)`; default `local` |
| `URL ปลายทาง` | `ai.baseUrl` | required when provider is `local`; must parse as http/https URL; trailing slash stripped; example placeholder `http://192.168.1.50:11434/v1`; ignored for `anthropic` |
| `API key` | `ai.apiKey` (encrypted) | optional for `local`, required for `anthropic` when enabling; never sent to the browser; page shows `ตั้งค่าแล้ว (ลงท้าย ••••abcd)` or `ยังไม่ได้ตั้ง`; empty input on save keeps the stored key; a checkbox `ลบ API key` clears it |
| `Model` | `ai.model` | required when enabled. `anthropic`: select of `claude-opus-5-5` (default), `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-2`. `local`: free text with a datalist filled by button `ดึงรายชื่อ model` (GET `<baseUrl>/models`) |

- Button `บันทึก`; button `ทดสอบการเชื่อมต่อ` tests the **saved** settings: sends the user message `ตอบคำว่า "พร้อมใช้งาน" เท่านั้น`, shows the reply text, the model name and elapsed ms, or a Thai error.
- When provider `anthropic` is selected the page shows the warning: `เมื่อใช้ Claude เนื้อหาเอกสารจะถูกส่งออกนอกเครือข่ายของบริษัทไปยัง Anthropic`.
- Encryption: AES-256-GCM, key = SHA-256 of env `SETTINGS_SECRET`. If `SETTINGS_SECRET` is unset or shorter than 16 chars, saving a non-empty API key fails with `ยังไม่ได้ตั้งค่า SETTINGS_SECRET ที่ server จึงบันทึก API key ไม่ได้` and nothing is written. A stored key that cannot be decrypted (secret changed) is treated as not set and the page says `API key เดิมอ่านไม่ได้ (SETTINGS_SECRET เปลี่ยน) กรุณาตั้งใหม่`.
- Thai errors for the test/list calls: timeout (15 s) → `เชื่อมต่อไม่สำเร็จ: หมดเวลา`; connection refused/DNS → `เชื่อมต่อไม่สำเร็จ: ติดต่อ <host> ไม่ได้`; 401/403 → `API key ไม่ถูกต้องหรือไม่มีสิทธิ์`; 404 → `ไม่พบ model หรือ URL ปลายทางไม่ถูกต้อง`; 429 → `ถูกจำกัดอัตราการใช้งาน กรุณาลองใหม่`; other → `ผู้ให้บริการตอบข้อผิดพลาด (<status>)`; AI disabled → `ยังไม่ได้เปิดใช้ AI`; Claude refusal stop reason → `model ปฏิเสธคำขอ`.

## Global Constraints

- Thai UI text exactly as written above. Follow README section "แนวทาง UI" and reuse `src/components/` (PageHeader, AppCard, form-fields, Icon); errors use `alert alert-danger py-2 small mb-3`.
- Services in `src/features/ai/` import nothing from `next/*` and return `ActionResult` (`src/lib/result.ts`); server actions are thin and call `requireAdmin()` (`src/lib/auth/current-user`), like `src/features/users/actions.ts`.
- The API key (plain or encrypted) must never appear in any value returned to a client component, in logs, or in error messages.
- Claude calls use the official `@anthropic-ai/sdk` only (no raw fetch, no OpenAI shim). Read `/private/tmp/claude-501/bundled-skills/2.1.330/bf9e00b749bc44da7bff3cb8e100c2fb/claude-api/typescript/claude-api/README.md` and `…/claude-api/shared/error-codes.md` before writing it: typed error classes, narrow content blocks by `.type`, check `stop_reason === "refusal"`, no `temperature`, no `budget_tokens`, exact model IDs with no date suffix. For models other than `claude-haiku-5-5` use `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`. `max_tokens: 16000`, `output_config: { effort: "low" }` for the test call.
- Local provider uses plain `fetch` to `<baseUrl>/chat/completions` and `<baseUrl>/models` (OpenAI wire format), `Authorization: Bearer <key>` only when a key is set.
- No test or e2e run may call a real external AI service; tests use a fake HTTP server started inside the test on an ephemeral port (`http.createServer`, `listen(0)`), closed in `afterAll`.
- PROCESS SAFETY: never kill a PID found via `lsof`/`ps`/a port; no `pkill`/`killall`; stop only processes you started and whose PID you captured. Never touch the user's dev server on port 3000, any Docker container, or the dev database `esm` (tests use `esm_test`; e2e uses port 3100 with `NEXT_DIST_DIR=.next-e2e`). Never `docker compose down`.
- Work on branch `ai-settings` created from `main` in this checkout. Commit trailer: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

- Saving the form with an empty API key field must keep the stored key, not erase it.
- Changing `SETTINGS_SECRET` after a key was stored must not crash the page.
- A local server that accepts the TCP connection but never answers must end in the timeout message within ~15 s, not hang the request.
- `<baseUrl>/models` returning a non-JSON or unexpected body must give a Thai error, not a 500.
- A non-admin opening `/admin/ai` or calling its actions gets the same treatment as `/admin/users`.

---

### Task 1: Settings service, encryption, provider adapters

**Files:**
- Create: `src/lib/secret-box.ts`, `src/features/ai/settings.ts`, `src/features/ai/client.ts`, `src/features/ai/providers/local.ts`, `src/features/ai/providers/anthropic.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`), `.env.example` (document `SETTINGS_SECRET`), `docker-compose.yml` (pass `SETTINGS_SECRET` to the app)
- Test: `tests/secret-box.test.ts`, `tests/ai-settings.test.ts`, `tests/ai-providers.test.ts`

**Interfaces (produced):**
```ts
// src/lib/secret-box.ts
export function hasSecret(): boolean;
export function seal(plain: string): string;          // throws if !hasSecret()
export function open(sealed: string): string | null;  // null when it cannot be decrypted

// src/features/ai/settings.ts
export type AiProvider = "local" | "anthropic";
export const CLAUDE_MODELS: readonly string[];
export type AiSettingsView = { enabled: boolean; provider: AiProvider; baseUrl: string; model: string;
  keyState: "none" | "set" | "unreadable"; keyHint: string | null /* last 4 chars */ };
export type AiSettingsInput = { enabled: boolean; provider: AiProvider; baseUrl: string; model: string;
  apiKey: string /* "" = keep */; clearKey: boolean };
export function getAiSettingsView(): Promise<AiSettingsView>;
export function saveAiSettings(input: AiSettingsInput): Promise<ActionResult<AiSettingsView>>;

// src/features/ai/client.ts
export type AiChatResult = { text: string; model: string; ms: number };
export interface AiClient { chat(input: { system?: string; user: string }): Promise<ActionResult<AiChatResult>>; }
export function getAiClient(): Promise<ActionResult<AiClient>>;  // fails with "ยังไม่ได้เปิดใช้ AI" when disabled
export function testAiConnection(): Promise<ActionResult<AiChatResult>>;
export function listLocalModels(baseUrl: string, apiKey?: string): Promise<ActionResult<string[]>>;
```
Provider adapters accept an optional `baseURL`/timeout override so tests can point them at the fake server.

- [ ] Step 1: Write failing tests:
  - `secret-box`: seal→open round-trips Thai and ASCII text; two seals of the same text differ; `open` of tampered text or under a different `SETTINGS_SECRET` returns null; `seal` throws when the secret is unset or under 16 chars.
  - `ai-settings`: defaults when the table is empty (`enabled false, provider "local", keyState "none"`); save local without baseUrl fails with a Thai error; baseUrl `ftp://x` fails; trailing slash stripped; save with apiKey stores a value in `Setting` that is not the plain key and `keyHint` is its last 4 chars; saving again with `apiKey: ""` keeps it; `clearKey: true` removes it; saving a key with no secret returns the exact `SETTINGS_SECRET` error and writes nothing; enabling `anthropic` with no key fails; `anthropic` model outside `CLAUDE_MODELS` fails; after changing `SETTINGS_SECRET`, view shows `keyState "unreadable"`; the object returned by `getAiSettingsView` contains neither the key nor its ciphertext.
  - `ai-providers` (fake server): local chat returns the reply text and sends `Authorization` only when a key is set; 401, 404, 429, 500, connection refused (closed port) and a never-answering server (use a short timeout override) each map to the Thai message in Design; `listLocalModels` returns ids from `{data:[{id}]}` and gives a Thai error for a non-JSON body; Anthropic adapter against a fake `/v1/messages` returning a text block yields the text, and a response with `stop_reason: "refusal"` yields `model ปฏิเสธคำขอ`; `getAiClient` fails with `ยังไม่ได้เปิดใช้ AI` when disabled.
- [ ] Step 2: Run `npm test` — the new tests fail for missing modules.
- [ ] Step 3: Implement the five source files to the interfaces above; install the SDK; update `.env.example` and `docker-compose.yml`.
- [ ] Step 4: Run `npm test` and `npm run lint` — all pass (165 existing + new).
- [ ] Step 5: Commit `feat(ai): model settings service, key encryption, provider adapters`.

### Task 2: Admin page, navigation, e2e

**Files:**
- Create: `src/features/ai/actions.ts`, `src/app/(app)/admin/ai/page.tsx`, `src/app/(app)/admin/ai/ai-settings-form.tsx`
- Modify: `src/components/shell/nav-model.ts`, `tests/nav-model.test.ts`, `e2e/release1.spec.ts` (or a new `e2e/ai-settings.spec.ts` matched by the Playwright config), `README.md`

**Interfaces (consumed):** everything from Task 1. Actions: `saveAiSettingsAction`, `testAiConnectionAction`, `listLocalModelsAction` — each starts with `requireAdmin()`.

- [ ] Step 1: Extend `tests/nav-model.test.ts`: admin sees `ตั้งค่า AI` → `/admin/ai`, non-admin does not; breadcrumb for `/admin/ai` is `[{label: "ตั้งค่า AI"}]`. Run — fails.
- [ ] Step 2: Implement nav, actions, page and form per Design (provider switch shows/hides `URL ปลายทาง`, swaps the model control, shows the Claude warning; save result and test result render inline).
- [ ] Step 3: E2E: the test starts a fake OpenAI-compatible server on an ephemeral port; admin opens `/admin/ai`, picks Local, enters the fake URL, clicks `ดึงรายชื่อ model`, picks the model, turns on `เปิดใช้ AI`, saves, clicks `ทดสอบการเชื่อมต่อ` and sees the fake reply; reload shows the saved values; a non-admin user visiting `/admin/ai` is handled like `/admin/users`. The e2e server must have `SETTINGS_SECRET` set (add it to the Playwright webServer env).
- [ ] Step 4: README: a section `ตั้งค่า AI Model` — the fields, `SETTINGS_SECRET`, an Ollama example URL, how a container reaches a model server on the host, and the Claude data-leaves-the-network warning.
- [ ] Step 5: Run `npm test`, `npm run lint`, `npm run build` (with `NEXT_DIST_DIR=.next-e2e` so the user's dev server build dir is untouched), `npm run test:e2e` — all pass.
- [ ] Step 6: Commit `feat(ai): admin AI model settings page`.
