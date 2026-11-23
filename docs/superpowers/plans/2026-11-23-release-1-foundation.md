# Release 1 — Foundation (login, users, projects, team, WP document store) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable web app where internal staff log in, an admin creates projects and users, a PM manages the team, and every project has a 23-work-product document store with versioned file uploads and signed-evidence attachments.

**Architecture:** One Next.js App Router project. Business rules live in plain TypeScript modules under `src/lib` and `src/features/*/service.ts` (unit/integration tested with Vitest against a real PostgreSQL test database); Server Actions in `src/features/*/actions.ts` are thin wrappers that resolve the current user, call a service, and revalidate. Files live on disk under `FILE_STORAGE_DIR`; PostgreSQL holds metadata only.

**Tech Stack:** Node 22, Next.js (latest stable via `create-next-app`), TypeScript strict, PostgreSQL 16, Prisma, zod, bcryptjs, Tailwind + shadcn/ui, Vitest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-23-project-management-system-design.md` (sections 6.1–6.5 and row "1" of 6.7). Later releases get their own plans.

## Global Constraints

- Database is PostgreSQL; schema changes only through Prisma migrations committed to the repo.
- All UI text is Thai. Dates display as `วว/ดด/ปปปป` in Buddhist year (`23/11/2569`); stored as normal `timestamptz`/`date`.
- Project roles: `PM`, `TL`, `AN`, `PR`, `QA`, `VIEWER`. System roles: `ADMIN`, `USER`. One member may hold several project roles; roles differ per project.
- Only `ADMIN` creates a project and assigns its first PM. Non-members cannot see a project (except `ADMIN`).
- `daily_rate` is visible only to that project's PM and to `ADMIN`.
- Uploaded files are stored on disk; the stored file name is never derived from user input. Max upload 50 MB.
- No customer login. No e-signature. Narrative documents are uploaded as files, never edited in the browser.
- Commit after every task; never commit `.env` or anything under `storage/`.
- **Deviation from spec 6.1:** Auth.js's credentials provider cannot use database sessions, so sessions are implemented directly (opaque cookie token + `Session` table). Behaviour the spec asks for (username/password, bcrypt, sessions in the database) is unchanged.

## Review Focus

1. Upload named `../../etc/passwd` or `แผนงาน โครงการ v1.0.docx` → saved under a generated name inside the project's storage folder; download returns the original Thai name intact. (Task 7)
2. Upload of the same version string twice for one WP → rejected with a Thai error, and no orphan file is left on disk. (Task 7)
3. A logged-in non-member requests `/api/files/<id>` of another project → 404, no bytes. (Task 7)
4. A user deactivated by the admin still holds a session cookie → next request is treated as logged out. (Task 3)
5. Project code entered as ` int-2569-001 ` or a duplicate of an existing code → stored trimmed/upper-cased; duplicate rejected with a Thai error. (Task 5)

---

## File Structure

```
docker-compose.yml            postgres (5432), app
Dockerfile                    multi-stage build, runs `prisma migrate deploy` then `next start`
.env.example                  DATABASE_URL, TEST_DATABASE_URL, FILE_STORAGE_DIR, SESSION_COOKIE_SECURE
prisma/schema.prisma          all Release 1 models
prisma/seed.ts                admin user + company setting
src/lib/db.ts                 PrismaClient singleton
src/lib/result.ts             ActionResult<T>, ok(), fail()
src/lib/dates.ts              formatThaiDate
src/lib/wp-catalog.ts         PHASES, WP_CATALOG (23 entries), getWp()
src/lib/auth/password.ts      hashPassword, verifyPassword
src/lib/auth/session.ts       createSession, getSessionUser, destroySession
src/lib/auth/current-user.ts  requireUser(), requireAdmin() (reads cookie)
src/lib/authz.ts              getMembership(), can()
src/lib/storage.ts            saveFile, openFile, deleteFile
src/features/users/{service,actions}.ts
src/features/projects/{service,actions}.ts
src/features/members/{service,actions}.ts
src/features/documents/{service,actions}.ts
src/app/login/page.tsx
src/app/(app)/layout.tsx                      shell: nav, user menu, logout
src/app/(app)/page.tsx                        project cards
src/app/(app)/admin/users/page.tsx
src/app/(app)/projects/new/page.tsx
src/app/(app)/projects/[code]/page.tsx        overview + team
src/app/(app)/projects/[code]/documents/page.tsx
src/app/api/files/[id]/route.ts               authorised download
tests/setup/global.ts, tests/setup/db.ts      migrate test DB, resetDb()
tests/**/*.test.ts                            Vitest
e2e/release1.spec.ts                          Playwright
```

---

### Task 1: Scaffold, database, test harness

**Files:** Create everything at repo root via `create-next-app`; `docker-compose.yml`, `.env.example`, `.gitignore`, `prisma/schema.prisma` (datasource + generator only), `src/lib/db.ts`, `src/lib/result.ts`, `vitest.config.ts`, `tests/setup/global.ts`, `tests/setup/db.ts`, `tests/smoke.test.ts`.

**Interfaces — Produces:**
- `prisma` (default PrismaClient singleton) from `src/lib/db.ts`
- `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`, `ok<T>(data: T)`, `fail(error: string)` from `src/lib/result.ts`
- `resetDb(): Promise<void>` from `tests/setup/db.ts` — truncates every table (`TRUNCATE ... RESTART IDENTITY CASCADE`) and empties `FILE_STORAGE_DIR`
- `countStoredFiles(projectId: string): Promise<number>` from `tests/setup/db.ts` — number of files under that project's storage folder (0 when the folder is absent)
- npm scripts: `dev`, `build`, `test` (vitest run), `test:e2e`, `db:migrate` (prisma migrate dev), `db:seed`

- [ ] **Step 1:** `git init`; run `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (the existing `docs/` folder stays). Install `prisma @prisma/client zod bcryptjs` and dev `vitest @types/bcryptjs tsx`. Run `npx shadcn@latest init` (defaults) and add `button input label table dialog select badge card dropdown-menu sonner`.
- [ ] **Step 2:** `docker-compose.yml` with service `postgres` (image `postgres:16`, port `5432`, volume `pgdata`, env `POSTGRES_USER=esm POSTGRES_PASSWORD=esm POSTGRES_DB=esm`) and an init script creating database `esm_test`. `.env.example` values: `DATABASE_URL=postgresql://esm:esm@localhost:5432/esm`, `TEST_DATABASE_URL=postgresql://esm:esm@localhost:5432/esm_test`, `FILE_STORAGE_DIR=./storage`, `SESSION_COOKIE_SECURE=false`. `.gitignore` adds `.env`, `storage/`, `test-storage/`.
- [ ] **Step 3:** `vitest.config.ts`: node environment, `globalSetup: tests/setup/global.ts` (sets `DATABASE_URL=TEST_DATABASE_URL`, `FILE_STORAGE_DIR=./test-storage`, runs `prisma migrate deploy`), `fileParallelism: false`, alias `@` → `src`.
- [ ] **Step 4: Write the failing test** `tests/smoke.test.ts`:

```ts
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/result";
test("database is reachable", async () => {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT 1::int AS n`;
  expect(rows[0].n).toBe(1);
});
test("result helpers", () => {
  expect(ok(5)).toEqual({ ok: true, data: 5 });
  expect(fail("x")).toEqual({ ok: false, error: "x" });
});
```

- [ ] **Step 5:** Run `docker compose up -d postgres && npm test` → FAIL (modules missing). Implement `src/lib/db.ts`, `src/lib/result.ts`. Run `npm test` → PASS.
- [ ] **Step 6:** Commit `chore: scaffold Next.js app with Postgres and test harness`.

---

### Task 2: Schema, WP catalogue, Thai dates

**Files:** Modify `prisma/schema.prisma`; create `src/lib/wp-catalog.ts`, `src/lib/dates.ts`, `tests/wp-catalog.test.ts`, `tests/dates.test.ts`.

**Interfaces — Produces:**

Prisma models (ids are `String @id @default(cuid())`, all have `createdAt`/`updatedAt`):
- `User { username @unique, passwordHash, fullName, position?, systemRole SystemRole @default(USER), active Boolean @default(true) }`
- `Session { tokenHash @unique, userId, expiresAt }`
- `Project { code @unique, name, shortName?, customerName?, customerContact?, type String @default("Internal"), startDate DateTime? @db.Date, endDate DateTime? @db.Date, budget Decimal? @db.Decimal(14,2), devCycle?, status ProjectStatus @default(PLANNING), description? }`
- `ProjectMember { projectId, userId, roles ProjectRole[], primaryRole ProjectRole, dailyRate Decimal? @db.Decimal(10,2), @@unique([projectId, userId]) }`
- `WpDocument { projectId, wpCode, status String @default("Draft"), currentVersion String?, @@unique([projectId, wpCode]) }`
- `DocumentVersion { wpDocumentId, version, note?, attachmentId @unique, uploadedById, @@unique([wpDocumentId, version]) }`
- `Attachment { projectId, entityType, entityId, kind AttachmentKind @default(OTHER), fileName, storedPath, size Int, mime, uploadedById }`
- `Setting { key @id, value }`
- Relation field names: `Project.members`, `Project.wpDocuments`, `WpDocument.versions`, `DocumentVersion.attachment`, `ProjectMember.user`, `ProjectMember.project`, `User.memberships`, `User.sessions`
- enums `SystemRole { ADMIN USER }`, `ProjectStatus { PLANNING ACTIVE CLOSED }`, `ProjectRole { PM TL AN PR QA VIEWER }`, `AttachmentKind { EVIDENCE SIGNED OTHER }`

`src/lib/wp-catalog.ts`:
- `type Phase = { no: number; folder: string; process: string }`
- `type WpDef = { code: string; seq: number; name: string; phaseNo: number; states: string[]; generated: boolean }`
- `PHASES: Phase[]` (9), `WP_CATALOG: WpDef[]` (23, ordered by `seq`), `getWp(code: string): WpDef` (throws on unknown)

`src/lib/dates.ts`: `formatThaiDate(d: Date | null | undefined): string` → `"23/11/2569"`, `""` for null.

Catalogue data (copy exactly; `states` is prefixed with `"Draft"` at runtime by the documents service, not here):

| seq | code | name | phase | states | generated |
|---|---|---|---|---|---|
| 1 | WP02 | Agreement | 1 | Reviewed, Approved, Baselined | no |
| 2 | WP10 | Project Plan | 1 | Reviewed, Validated, Accepted, Updated | no |
| 3 | WP11 | Project Repository | 1 | Updated, Recovered | yes |
| 4 | WP12 | Project Repository Backup | 1 | Recovered | yes |
| 5 | WP07 | Meeting Record | 2 | Approved | yes |
| 6 | WP09 | Progress Status Record | 2 | Published | yes |
| 7 | WP03 | Change Request | 2 | Initiated, Evaluated, Accepted, Rejected | yes |
| 8 | WP04 | Correction Register | 2 | Initiated, Approved, Completed | yes |
| 9 | WP23 | Verification Record | 2 | Initiated, Approved | yes |
| 10 | WP22 | Validation Record | 2 | Initiated, Approved | yes |
| 11 | WP05 | Implementation Environment | 3 | Established | no |
| 12 | WP13 | Requirements Specification | 4 | Verified, Validated, Baselined | no |
| 13 | WP21 | Traceability Record | 4 | Verified, Baselined, Updated | yes |
| 14 | WP16 | Software Design | 5 | Verified, Approved | no |
| 15 | WP19 | Test Cases and Test Procedures | 5 | Verified, Baselined | yes |
| 16 | WP15 | Software Components | 6 | Unit tested, Corrected, Baselined | no |
| 17 | WP14 | Software | 7 | Tested, Corrected, Baselined | no |
| 18 | WP20 | Test Report | 7 | Initiated, Corrected, Baselined | yes |
| 19 | WP18 | Software User Documentation | 7 | Preliminary, Verified, Baselined | no |
| 20 | WP08 | Product Operation Guideline | 7 | Verified, Baselined | no |
| 21 | WP06 | Maintenance Documentation | 8 | Validated, Baselined | no |
| 22 | WP17 | Software Product | 8 | Delivered, Accepted | no |
| 23 | WP01 | Acceptance Record | 9 | Initiated, Signed | no |

Phases (`folder` / `process`): 1 `Project Planning` / `PM.01`; 2 `Project Plan Execution, Assessment and Control` / `PM.02-PM.03`; 3 `Software Implementation Initiation` / `SI.01`; 4 `Software Requirements Analysis` / `SI.02`; 5 `Software Architectural and Detailed Design` / `SI.03`; 6 `Software Construction` / `SI.04`; 7 `Software Integration and Tests` / `SI.05`; 8 `Software Product Assembly` / `SI.06`; 9 `Project Closure` / `PM.04`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/wp-catalog.test.ts
import { WP_CATALOG, PHASES, getWp } from "@/lib/wp-catalog";
test("23 work products, unique codes WP01..WP23, seq 1..23", () => {
  expect(WP_CATALOG).toHaveLength(23);
  expect(new Set(WP_CATALOG.map(w => w.code)).size).toBe(23);
  expect(WP_CATALOG.map(w => w.seq)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
});
test("phase membership matches the standard", () => {
  expect(PHASES).toHaveLength(9);
  expect(getWp("WP14").phaseNo).toBe(7);
  expect(getWp("WP21").phaseNo).toBe(4);
  expect(WP_CATALOG.filter(w => w.phaseNo === 2).map(w => w.code))
    .toEqual(["WP07", "WP09", "WP03", "WP04", "WP23", "WP22"]);
});
test("unknown code throws", () => { expect(() => getWp("WP99")).toThrow(); });

// tests/dates.test.ts
import { formatThaiDate } from "@/lib/dates";
test("Buddhist year, zero padded", () => {
  expect(formatThaiDate(new Date("2026-11-23T00:00:00+07:00"))).toBe("23/11/2569");
  expect(formatThaiDate(new Date("2027-01-05T00:00:00+07:00"))).toBe("05/01/2570");
  expect(formatThaiDate(null)).toBe("");
});
```

- [ ] **Step 2:** `npm test` → FAIL. Write the schema, run `npm run db:migrate -- --name init`, implement the two modules (format in time zone `Asia/Bangkok`). `npm test` → PASS.
- [ ] **Step 3:** Commit `feat: release 1 schema, WP catalogue, Thai date format`.

---

### Task 3: Passwords, sessions, login

**Files:** Create `src/lib/auth/password.ts`, `src/lib/auth/session.ts`, `src/lib/auth/current-user.ts`, `src/features/auth/actions.ts`, `src/app/login/page.tsx`, `src/middleware.ts`, `prisma/seed.ts`, `tests/auth.test.ts`.

**Interfaces**
- Consumes: `prisma`, `User`, `Session`.
- Produces:
  - `hashPassword(plain: string): Promise<string>`; `verifyPassword(plain: string, hash: string): Promise<boolean>` (bcryptjs, cost 10)
  - `createSession(userId: string): Promise<{ token: string; expiresAt: Date }>` — 32 random bytes hex; DB stores SHA-256 of it; lifetime 7 days
  - `getSessionUser(token: string | undefined): Promise<User | null>` — null when missing, expired, or `user.active === false`
  - `destroySession(token: string): Promise<void>`
  - `authenticate(username: string, password: string): Promise<User | null>` — null for unknown user, wrong password, or inactive user
  - `requireUser(): Promise<User>` (redirects to `/login`), `requireAdmin(): Promise<User>` (throws `notFound()` for non-admin) — read cookie `esm_session` (httpOnly, sameSite lax, `secure` from `SESSION_COOKIE_SECURE`)
  - Server actions `loginAction(prev, formData)`, `logoutAction()`
  - Seed: user `admin` / password from env `SEED_ADMIN_PASSWORD` (required; seed fails without it), `systemRole ADMIN`; `Setting company_name = "ชื่อบริษัท"`

- [ ] **Step 1: Write the failing tests** (`tests/auth.test.ts`, `beforeEach(resetDb)`):

```ts
test("password round trip", async () => {
  const h = await hashPassword("s3cret!");
  expect(h).not.toContain("s3cret");
  expect(await verifyPassword("s3cret!", h)).toBe(true);
  expect(await verifyPassword("wrong", h)).toBe(false);
});
test("authenticate rejects wrong password, unknown and inactive users", async () => {
  const u = await prisma.user.create({ data: { username: "pm1", fullName: "สมชาย", passwordHash: await hashPassword("pw") } });
  expect((await authenticate("pm1", "pw"))?.id).toBe(u.id);
  expect(await authenticate("pm1", "nope")).toBeNull();
  expect(await authenticate("ghost", "pw")).toBeNull();
  await prisma.user.update({ where: { id: u.id }, data: { active: false } });
  expect(await authenticate("pm1", "pw")).toBeNull();
});
test("session lifecycle; token is not stored in clear", async () => {
  const u = await prisma.user.create({ data: { username: "a", fullName: "A", passwordHash: "x" } });
  const { token } = await createSession(u.id);
  expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
  expect((await getSessionUser(token))?.id).toBe(u.id);
  await destroySession(token);
  expect(await getSessionUser(token)).toBeNull();
  expect(await getSessionUser(undefined)).toBeNull();
});
test("expired session and deactivated user are logged out", async () => {   // Review Focus 4
  const u = await prisma.user.create({ data: { username: "b", fullName: "B", passwordHash: "x" } });
  const s1 = await createSession(u.id);
  await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await getSessionUser(s1.token)).toBeNull();
  const s2 = await createSession(u.id);
  await prisma.user.update({ where: { id: u.id }, data: { active: false } });
  expect(await getSessionUser(s2.token)).toBeNull();
});
```

- [ ] **Step 2:** `npm test` → FAIL. Implement the modules. `npm test` → PASS.
- [ ] **Step 3:** Login page (fields `ชื่อผู้ใช้`, `รหัสผ่าน`, button `เข้าสู่ระบบ`; on failure show exactly `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง`). `middleware.ts` redirects requests without the cookie to `/login` (matcher excludes `/login`, `/_next`, static assets); real validation stays in `requireUser()`.
- [ ] **Step 4:** `SEED_ADMIN_PASSWORD=change-me npm run db:seed`, `npm run dev`, log in as `admin` → lands on `/`. Commit `feat: username/password login with database sessions`.

---

### Task 4: Authorisation rules

**Files:** Create `src/lib/authz.ts`, `tests/authz.test.ts`.

**Interfaces**
- Consumes: `User`, `ProjectMember`, `ProjectRole`.
- Produces:
  - `type Action = "project.view" | "project.edit" | "member.manage" | "member.viewRate" | "document.upload" | "document.setStatus" | "document.baseline" | "attachment.add"`
  - `type Actor = { user: Pick<User, "id" | "systemRole">; roles: ProjectRole[] | null }` (`roles` null = not a member)
  - `can(actor: Actor, action: Action): boolean`
  - `getActor(user: User, projectId: string): Promise<Actor>`
  - `assertCan(actor: Actor, action: Action): void` — throws `ForbiddenError` (exported class)

Rules: `ADMIN` → everything. Non-member → nothing. Member: `project.view` all roles; `project.edit`, `member.manage`, `member.viewRate` → `PM`; `document.upload`, `document.setStatus`, `attachment.add` → every role except `VIEWER`; `document.baseline` → `PM`, `TL`.

- [ ] **Step 1: Write the failing test** — a table-driven test asserting, for each of `ADMIN`, non-member, `PM`, `TL`, `AN`, `PR`, `QA`, `VIEWER`, `[PR, TL]` (multi-role), the exact boolean for all eight actions per the rules above; plus `assertCan` throws `ForbiddenError` for `VIEWER` + `document.upload`.
- [ ] **Step 2:** `npm test` → FAIL; implement; → PASS. Commit `feat: project role authorisation`.

---

### Task 5: Users and projects

**Files:** Create `src/features/users/{service,actions}.ts`, `src/features/projects/{service,actions}.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/projects/new/page.tsx`, `tests/users.test.ts`, `tests/projects.test.ts`.

**Interfaces**
- Consumes: `requireUser`, `requireAdmin`, `hashPassword`, `can`, `getActor`, `WP_CATALOG`, `ok`/`fail`.
- Produces (services take the acting `User` first and return `ActionResult`):
  - `createUser(admin, input: { username; fullName; position?; password; systemRole })`, `updateUser(admin, id, input)`, `setUserActive(admin, id, active)`, `resetPassword(admin, id, password)`, `listUsers(admin)`
  - `createProject(admin, input: { code; name; shortName?; customerName?; startDate?; endDate?; budget?; pmUserId }): Promise<ActionResult<Project>>` — in one transaction creates the project, the PM `ProjectMember` (`roles: [PM]`, `primaryRole: PM`), and 23 `WpDocument` rows (`status: "Draft"`)
  - `updateProject(user, projectId, input)`, `listVisibleProjects(user): Promise<Project[]>`, `getProjectByCode(user, code): Promise<Project | null>` (null when not visible)
  - `normalizeProjectCode(raw: string): string` — trim + upper-case

Validation (zod): `username` 3–32 chars `[a-z0-9._-]`; `password` ≥ 8 chars; project `code` matches `^[A-Z0-9][A-Z0-9-]{2,29}$` after normalising; `endDate >= startDate`. Error strings: `ชื่อผู้ใช้นี้ถูกใช้แล้ว`, `รหัสโครงการนี้ถูกใช้แล้ว`, `รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร`, `วันสิ้นสุดต้องไม่ก่อนวันเริ่ม`, `ไม่มีสิทธิ์ดำเนินการ`. An admin cannot deactivate themself (`ไม่สามารถปิดบัญชีของตนเองได้`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/projects.test.ts (helpers mkUser(role?) create users directly through prisma)
test("admin creates project with PM and 23 WP slots", async () => {
  const r = await createProject(admin, { code: "INT-2569-001", name: "TaskDoc", pmUserId: pm.id });
  expect(r.ok).toBe(true);
  const p = await prisma.project.findUniqueOrThrow({ where: { code: "INT-2569-001" }, include: { members: true, wpDocuments: true } });
  expect(p.members).toMatchObject([{ userId: pm.id, roles: ["PM"], primaryRole: "PM" }]);
  expect(p.wpDocuments).toHaveLength(23);
  expect(p.wpDocuments.every(d => d.status === "Draft")).toBe(true);
});
test("code is normalised and duplicates rejected", async () => {            // Review Focus 5
  await createProject(admin, { code: " int-2569-001 ", name: "A", pmUserId: pm.id });
  expect(await prisma.project.count({ where: { code: "INT-2569-001" } })).toBe(1);
  const dup = await createProject(admin, { code: "INT-2569-001", name: "B", pmUserId: pm.id });
  expect(dup).toEqual({ ok: false, error: "รหัสโครงการนี้ถูกใช้แล้ว" });
  expect(await prisma.wpDocument.count()).toBe(23);
});
test("non-admin cannot create a project", async () => {
  expect(await createProject(pm, { code: "X-1", name: "X", pmUserId: pm.id })).toEqual({ ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" });
});
test("visibility: members and admin only", async () => {
  await createProject(admin, { code: "P-001", name: "P", pmUserId: pm.id });
  expect((await listVisibleProjects(pm)).map(p => p.code)).toEqual(["P-001"]);
  expect(await listVisibleProjects(outsider)).toEqual([]);
  expect(await getProjectByCode(outsider, "P-001")).toBeNull();
  expect((await listVisibleProjects(admin)).length).toBe(1);
});
```

`tests/users.test.ts`: duplicate username → `ชื่อผู้ใช้นี้ถูกใช้แล้ว`; 7-char password rejected; non-admin calling `createUser` → `ไม่มีสิทธิ์ดำเนินการ`; `setUserActive(admin, admin.id, false)` → `ไม่สามารถปิดบัญชีของตนเองได้`; `resetPassword` makes `authenticate` succeed with the new password and fail with the old.

- [ ] **Step 2:** `npm test` → FAIL; implement services and actions; → PASS.
- [ ] **Step 3:** UI. Shell nav: `โครงการ`, `ผู้ใช้งาน` (admin only), user menu with `ออกจากระบบ`. `/` shows a card per visible project (code, name, status badge `วางแผน`/`ดำเนินการ`/`ปิดโครงการ`, dates via `formatThaiDate`) and, for admin, a `สร้างโครงการ` button. `/admin/users` table with create/edit dialog, activate toggle, reset password. `/projects/new` form with a PM selector listing active users.
- [ ] **Step 4:** Manual check in `npm run dev`: create a user, create a project with that user as PM, log in as them, see the card. Commit `feat: user administration and project creation`.

---

### Task 6: Project overview and team

**Files:** Create `src/features/members/{service,actions}.ts`, `src/app/(app)/projects/[code]/layout.tsx` (tabs `ภาพรวม`, `เอกสาร`), `src/app/(app)/projects/[code]/page.tsx`, `tests/members.test.ts`.

**Interfaces**
- Consumes: `getActor`, `can`, `getProjectByCode`, `updateProject`.
- Produces:
  - `addMember(user, projectId, input: { userId; roles: ProjectRole[]; primaryRole: ProjectRole; dailyRate?: number })`
  - `updateMember(user, memberId, input)`, `removeMember(user, memberId)`
  - `listMembers(user, projectId): Promise<MemberView[]>` where `MemberView = { id; userId; fullName; position; roles; primaryRole; dailyRate: string | null }` — `dailyRate` is `null` unless the caller `can(..., "member.viewRate")`

Rules: `roles` non-empty; `primaryRole` must be in `roles` (`บทบาทหลักต้องอยู่ในบทบาทที่เลือก`); a user can be added once (`ผู้ใช้นี้อยู่ในทีมแล้ว`); the last member holding `PM` cannot be removed or lose `PM` (`โครงการต้องมี PM อย่างน้อย 1 คน`).

- [ ] **Step 1: Write the failing tests** (`tests/members.test.ts`): PM adds a member with `[PR, QA]`/`PR`; `AN` member calling `addMember` → `ไม่มีสิทธิ์ดำเนินการ`; duplicate add → error above; `primaryRole` outside `roles` → error above; removing the only PM → error above, and it succeeds once a second PM exists; `listMembers` returns `dailyRate: "2500.00"` for the PM and for admin, `null` for an `AN` member.
- [ ] **Step 2:** `npm test` → FAIL; implement; → PASS.
- [ ] **Step 3:** Overview page: project facts (editable by PM in a dialog), team table (`ชื่อ-สกุล`, `ตำแหน่ง`, `บทบาท`, and `อัตรา/วัน` column only when visible), add/edit/remove for PM. Role labels: PM `ผู้จัดการโครงการ`, TL `Technical Leader`, AN `นักวิเคราะห์`, PR `โปรแกรมเมอร์`, QA `ผู้ทดสอบ`, VIEWER `ผู้ดูข้อมูล`.
- [ ] **Step 4:** Commit `feat: project overview and team management`.

---

### Task 7: File storage and WP document store

**Files:** Create `src/lib/storage.ts`, `src/features/documents/{service,actions}.ts`, `src/app/(app)/projects/[code]/documents/page.tsx`, `src/app/api/files/[id]/route.ts`, `tests/storage.test.ts`, `tests/documents.test.ts`; modify `next.config.ts` (`experimental.serverActions.bodySizeLimit: "55mb"`).

**Interfaces**
- Consumes: `getActor`, `assertCan`, `getWp`, `WP_CATALOG`, `PHASES`.
- Produces:
  - `MAX_FILE_BYTES = 50 * 1024 * 1024`
  - `saveFile(projectId: string, originalName: string, data: Buffer): Promise<{ storedPath: string; size: number }>` — writes `${FILE_STORAGE_DIR}/${projectId}/${randomUUID()}${ext}` where `ext` is the lower-cased extension of the base name restricted to `[a-z0-9]{1,8}` (else empty); `storedPath` is relative to `FILE_STORAGE_DIR`
  - `openFile(storedPath: string): Promise<Buffer>` — rejects any path resolving outside `FILE_STORAGE_DIR`
  - `deleteFile(storedPath: string): Promise<void>`
  - `uploadVersion(user, projectId, wpCode, input: { version: string; note?: string; fileName: string; mime: string; data: Buffer }): Promise<ActionResult<DocumentVersion>>` — creates `Attachment` (`entityType: "WpDocument"`, `kind: OTHER`) + `DocumentVersion`, sets `WpDocument.currentVersion`
  - `setDocumentStatus(user, projectId, wpCode, status: string)` — status must be `"Draft"` or one of `getWp(wpCode).states`; setting `"Baselined"` needs `document.baseline`, others need `document.setStatus`
  - `addAttachment(user, projectId, input: { entityType: string; entityId: string; kind: AttachmentKind; fileName; mime; data })`
  - `listDocuments(user, projectId): Promise<PhaseView[]>` — 9 phases in order; `PhaseView = { phase: Phase; items: DocItem[] }`, items in `seq` order; `DocItem = { wp: WpDef; id: string; status: string; currentVersion: string | null; versions: { version; note; attachmentId; fileName; uploadedBy; createdAt }[]; attachments: { id; kind; fileName; uploadedBy; createdAt }[] }`
  - `GET /api/files/[id]` — attachment id; 404 unless the caller `can(..., "project.view")` on the attachment's project; responds with `Content-Disposition: attachment; filename*=UTF-8''<percent-encoded original name>`

Rules: `version` matches `^\d+\.\d+(\.\d+)?$` (`รูปแบบเวอร์ชันไม่ถูกต้อง เช่น 1.0`); unique per WP (`เวอร์ชันนี้มีอยู่แล้ว`); empty file rejected (`ไฟล์ว่างเปล่า`); over limit rejected (`ไฟล์ใหญ่เกิน 50 MB`); if the DB write fails after the file is written, the file is deleted.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/storage.test.ts
test("stored name ignores user input; traversal impossible", async () => {      // Review Focus 1
  const a = await saveFile("proj1", "../../etc/passwd", Buffer.from("x"));
  expect(a.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}$/);
  const b = await saveFile("proj1", "แผนงาน โครงการ v1.0.DOCX", Buffer.from("hello"));
  expect(b.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}\.docx$/);
  expect((await openFile(b.storedPath)).toString()).toBe("hello");
  await expect(openFile("../.env")).rejects.toThrow();
});

// tests/documents.test.ts
test("upload creates version 1.0 and sets current version", async () => {
  const r = await uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "แผน.docx", mime: DOCX, data: Buffer.from("a") });
  expect(r.ok).toBe(true);
  const d = await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: "WP10" } } });
  expect(d.currentVersion).toBe("1.0");
});
test("duplicate version rejected and leaves no orphan file", async () => {      // Review Focus 2
  await uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "a.docx", mime: DOCX, data: Buffer.from("a") });
  const before = await countStoredFiles(project.id);
  const r = await uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "b.docx", mime: DOCX, data: Buffer.from("b") });
  expect(r).toEqual({ ok: false, error: "เวอร์ชันนี้มีอยู่แล้ว" });
  expect(await countStoredFiles(project.id)).toBe(before);
});
test("bad version, empty and oversize files rejected", async () => {
  const up = (o: object) => uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "a.docx", mime: DOCX, data: Buffer.from("a"), ...o });
  expect(await up({ version: "v1" })).toEqual({ ok: false, error: "รูปแบบเวอร์ชันไม่ถูกต้อง เช่น 1.0" });
  expect(await up({ data: Buffer.alloc(0) })).toEqual({ ok: false, error: "ไฟล์ว่างเปล่า" });
  expect(await up({ data: Buffer.alloc(MAX_FILE_BYTES + 1) })).toEqual({ ok: false, error: "ไฟล์ใหญ่เกิน 50 MB" });
});
test("viewer cannot upload; only PM/TL can baseline; status must belong to the WP", async () => {
  expect((await uploadVersion(viewer, project.id, "WP10", { version: "2.0", fileName: "a.docx", mime: DOCX, data: Buffer.from("a") })).ok).toBe(false);
  expect((await setDocumentStatus(analyst, project.id, "WP13", "Verified")).ok).toBe(true);
  expect((await setDocumentStatus(analyst, project.id, "WP13", "Baselined")).ok).toBe(false);
  expect((await setDocumentStatus(tl, project.id, "WP13", "Baselined")).ok).toBe(true);
  expect((await setDocumentStatus(pm, project.id, "WP13", "Published")).ok).toBe(false);
});
test("listDocuments groups 23 WPs into 9 phases in catalogue order", async () => {
  const v = await listDocuments(pm, project.id);
  expect(v.map(p => p.phase.no)).toEqual([1,2,3,4,5,6,7,8,9]);
  expect(v.flatMap(p => p.items.map(i => i.wp.code))).toEqual(WP_CATALOG.map(w => w.code));
});
test("signed evidence attaches to a WP document", async () => {
  const doc = await prisma.wpDocument.findFirstOrThrow({ where: { projectId: project.id, wpCode: "WP01" } });
  const r = await addAttachment(pm, project.id, { entityType: "WpDocument", entityId: doc.id, kind: "SIGNED", fileName: "signed.pdf", mime: "application/pdf", data: Buffer.from("p") });
  expect(r.ok).toBe(true);
});
test("download route: member gets bytes with Thai filename, outsider gets 404", async () => {  // Review Focus 1, 3
  // build each Response by calling the route handler's exported GET with a Request whose Cookie header is
  // `esm_session=<token from createSession(user.id)>` (no cookie for the anonymous case); the attachment is the WP10 upload named แผน.docx
  expect(memberRes.status).toBe(200);
  expect(memberRes.headers.get("content-disposition")).toContain("filename*=UTF-8''%E0%B9%81%E0%B8%9C%E0%B8%99.docx");
  expect(outsiderRes.status).toBe(404);
  expect(anonymousRes.status).toBe(404);
});
```

- [ ] **Step 2:** `npm test` → FAIL; implement storage, service, route; → PASS.
- [ ] **Step 3:** Documents page: one section per phase headed `01 Project Planning (PM.01)` etc.; each WP row shows `01 · WP02 Agreement`, status badge, current version, a badge `ระบบสร้างให้` when `generated`, expandable version history (version, file link, note, uploader, date), signed/evidence attachments, and buttons `อัปโหลดเวอร์ชันใหม่`, `แนบหลักฐาน`, status selector — each hidden when `can()` is false.
- [ ] **Step 4:** Manual check: upload a `.docx` with a Thai name, download it, change status. Commit `feat: WP document store with versioned uploads and evidence attachments`.

---

### Task 8: End-to-end path and deployment

**Files:** Create `e2e/release1.spec.ts`, `playwright.config.ts`, `Dockerfile`, `.dockerignore`, `README.md`; modify `docker-compose.yml` (add `app` service), `next.config.ts` (`output: "standalone"`).

**Interfaces — Consumes:** everything above. **Produces:** `docker compose up -d --build` serving the app on port `3000` with volumes `pgdata` and `files` (mounted at `/data/files`, `FILE_STORAGE_DIR=/data/files`); the container runs `prisma migrate deploy` before starting.

- [ ] **Step 1: Write the failing e2e test** — one scenario against `npm run dev` with the test database, seeded admin:
  1. log in as `admin`; create user `pm1` (name `สมชาย ใจดี`); create project `INT-2569-001` with PM `pm1`; log out
  2. log in as `pm1`; open the project card; assert the team table lists `สมชาย ใจดี` with role `ผู้จัดการโครงการ`; open `เอกสาร`
  3. assert 9 phase headings and 23 WP rows are visible
  4. on `WP10 Project Plan`, upload `e2e/fixtures/แผนโครงการ.docx` as version `1.0`; assert the row shows `1.0`; set status `Reviewed`; assert the badge
  5. log out; open `/projects/INT-2569-001` → redirected to `/login`
- [ ] **Step 2:** `npm run test:e2e` → fix until PASS.
- [ ] **Step 3:** Dockerfile (node:22-alpine, build stage + standalone runtime, non-root user), compose `app` service (`depends_on` postgres healthcheck, env from `.env`, `SESSION_COOKIE_SECURE=true` documented for HTTPS). README in Thai: prerequisites, first install (`cp .env.example .env`, set passwords, `docker compose up -d --build`, run seed once), how to back up (`pg_dump` + copy the `files` volume), how to update.
- [ ] **Step 4:** `docker compose up -d --build`; `curl -sI http://localhost:3000/login` → `200`; log in through the browser once. `docker compose down`.
- [ ] **Step 5:** Commit `feat: e2e coverage and Docker Compose deployment`.

---

## Not in this release (later plans)

Milestones, WBS/tasks, risks, budget, dashboard metrics (Release 2); registers and docx export (3–5); whole-project export, record locking, audit log, backup log (6). `project_objective`, `project_signatory`, `doc_sequence`, `backup_log`, `repository_property` are added by the releases that use them.
