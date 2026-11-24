# Release 2A — Plan, Traceability Links, Template Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per project: milestones, WBS tasks with codes, agreement scope items, requirements, components, the links AG → REQ → Task → Component with a gap view; a template/sample download store read from a server folder; self-service password change.

**Architecture:** Same layering as Release 1: Prisma models, services in `src/features/<area>/service.ts` returning `ActionResult` (no `next/*` imports), thin server actions, pages under `src/app/(app)/projects/[code]/…` built from the kit in `src/components/`. Codes come from one transactional sequence service. Templates are files on disk under `TEMPLATES_DIR`, scanned per request.

**Tech Stack:** Next.js 16.4.6 (read `node_modules/next/dist/docs/` first, per AGENTS.md; `src/proxy.ts` not middleware), TypeScript strict, Prisma 6, PostgreSQL 16, zod, react-bootstrap + project Sass theme, Vitest on real DB `esm_test`, Playwright on port 3100 with `NEXT_DIST_DIR=.next-e2e`.

**Spec:** `docs/superpowers/specs/2026-11-24-release-2-plan-trace-meeting-design.md` (sections 5.1, 5.3–5.8; Meeting Record and the template filler are Release 2B, not this plan). Parent: `docs/superpowers/specs/2026-11-23-project-management-system-design.md` §6.2, §6.3, §8.

## Global Constraints

- UI text is Thai; dates display via `formatThaiDate` (วว/ดด/ปปปป พ.ศ.). Follow README "แนวทาง UI": `PageHeader`, `AppCard`, `FormDialog` (with `ยกเลิก`), `form-fields`, `IconButton`, `StatusBadge`; one error style `alert alert-danger py-2 small mb-3`; tables use the responsive pattern (`table-actions` sticky column, secondary columns hidden below `md`). Every new Thai string that the plan does not spell out is the implementer's choice and must be listed in the task report.
- Permissions (spec 5.5(4)); ADMIN bypasses; non-members get not-found like existing project pages:
  - Milestone, Task create/edit/delete: PM. The task's assignee may edit only `status`, `percent`, `actualStart`, `actualEnd`, `actualDays` of their own task.
  - Agreement item, Requirement, Component and all links: AN, TL. Requirement → Approved (and back): TL, PM.
  - Read: every project member.
- Codes: issued by the sequence service inside the same transaction as the insert; never editable; never reused after delete. Formats: `M1`, `T-001`, `AG-01`, `REQ-F01` (Functional), `REQ-N01` (NonFunctional), `C01`. `doc_sequence.year` is `0` for these (no year).
- An item that is the target or source of a link cannot be deleted; the error names what references it, e.g. `ลบไม่ได้: ถูกอ้างจาก T-003, T-007`.
- Statuses: Task `TODO|DOING|DONE|BLOCKED` (labels `ยังไม่เริ่ม`, `กำลังทำ`, `เสร็จ`, `ติดขัด`); Task kind `PLAN|DEV|FIX|REVIEW`; Requirement `PROPOSED|APPROVED|DROPPED` (labels `เสนอ`, `อนุมัติ`, `ตัดออก`); an APPROVED requirement's text/type cannot be edited until its status is changed back. Component `unitTestStatus` `NOT_TESTED|PASSED|FAILED` (labels `ยังไม่ทดสอบ`, `ผ่าน`, `ไม่ผ่าน`). `percent` 0–100 integer; setting status DONE sets percent 100. Day fields are decimals in steps of 0.5.
- Database: additive migrations only. Create with `npx prisma migrate dev --create-only --name <name>` then apply with `npx prisma migrate deploy`. If any Prisma command proposes to reset or drop a database, answer no and stop with status BLOCKED. Never reset or wipe the dev database `esm`. Tests use `esm_test` through the existing test setup.
- PROCESS SAFETY: never kill a PID found via `lsof`/`ps`/a port; no `pkill`/`killall`; stop only processes you started and whose PID you captured. Never touch the dev server on port 3000 or any Docker container; never `docker compose down`. If a port is busy, use another.
- No test may use the network or depend on files outside the repo.
- Branch `release-2a` from `main`, in this checkout. One commit per task. Trailer: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Each task ends with `npm test` and `npm run lint` passing; tasks that add pages also run `NEXT_DIST_DIR=.next-e2e npm run build`.

## Review Focus

- Two concurrent creates in one project must get different codes (no duplicate, no gap-filling of deleted codes).
- A member of project A must not read or link items of project B by passing B's ids (every service call checks the item's `projectId` against the actor's project).
- An assignee who is not PM can change progress fields of their own task and nothing else; cannot touch another person's task.
- A file name like `../../etc/passwd`, an absolute path, or a symlink pointing outside `TEMPLATES_DIR` must not be downloadable; a missing or unreadable `TEMPLATES_DIR` must render pages without template buttons, not crash.
- WBS parent cycles (a task made a child of its own descendant) must be rejected.

---

### Task 1: Schema, sequence service, authz

**Files:** Modify `prisma/schema.prisma` (+ new migration), `src/lib/authz.ts`, `tests/authz.test.ts`, `tests/schema-cascade.test.ts`. Create `src/lib/sequence.ts`, `tests/sequence.test.ts`.

**Interfaces (produced):**
```ts
// src/lib/sequence.ts — must be called with the transaction client of the insert
export type SeqPrefix = "M" | "T" | "AG" | "REQ-F" | "REQ-N" | "C" | "MR";
export function nextCode(tx: Prisma.TransactionClient, projectId: string, prefix: SeqPrefix, buddhistYear?: number): Promise<string>;
export function formatCode(prefix: SeqPrefix, no: number, buddhistYear?: number): string;
// "M"→M1, "T"→T-001, "AG"→AG-01, "REQ-F"→REQ-F01, "REQ-N"→REQ-N01, "C"→C01, "MR"+2569→MR-2569-01

// src/lib/authz.ts — new actions added to Action and RULES
"plan.manage" (PM) | "trace.manage" (AN, TL) | "requirement.approve" (TL, PM)
export function canUpdateTaskProgress(actor: Actor, task: { assigneeId: string | null }): boolean; // PM/ADMIN, or assignee who is a member
```
Models (all with `projectId` FK `onDelete: Cascade`, `createdAt`, `updatedAt`, `@@unique([projectId, code])`): `DocSequence` (`@@unique([projectId, prefix, year])`, `lastNo`), `Milestone` (code, name, plannedDate, revisedDate?, actualDate?), `Task` (code, wbsCode?, parentId? self-relation `onDelete: Restrict`, title, kind, isoActivity?, qaType?, assigneeId? → User, milestoneId?, plannedStart/End?, actualStart/End?, status, percent, plannedDays?, actualDays?, outputWp?, note?), `AgreementItem` (code, text), `Requirement` (code, type, text, priority?, agreementItemId?, designRef?, status), `Component` (code, name, description?, ownerId? → User, unitTestStatus, version?), join tables `TaskRequirement`, `TaskComponent`, `RequirementComponent` (composite PK, both sides `onDelete: Restrict`).

- [ ] Step 1: Failing tests — `sequence`: formats above; first code per prefix is 1; 20 parallel `nextCode` calls for one project/prefix yield 20 distinct consecutive codes; sequences are independent per project, per prefix and per year; deleting a row and creating again does not reuse the number. `authz`: each new action per role as in Global Constraints; `canUpdateTaskProgress` true for PM, ADMIN, the assignee; false for other members, for a VIEWER-only assignee, for non-members. `schema-cascade`: deleting a project removes its rows in every new table.
- [ ] Step 2: Run — fail. Step 3: Implement schema + migration (`--create-only` then `migrate deploy`), `sequence.ts` (row lock via upsert + increment inside `tx`), authz additions. Step 4: `npm test`, `npm run lint` pass. Step 5: Commit `feat(plan): schema, code sequences, permissions for release 2A`.

### Task 2: Milestones and tasks

**Files:** Create `src/features/plan/{service,actions}.ts`, `src/app/(app)/projects/[code]/plan/page.tsx`, `plan/plan-dialogs.tsx`, `plan/[taskCode]/page.tsx`, `src/components/reference-panel.tsx`, `tests/plan.test.ts`. Modify `src/components/shell/nav-model.ts` (+ test), `src/lib/labels.ts`.

**Interfaces:** consumes Task 1. Produces
```ts
createMilestone/updateMilestone/deleteMilestone(user, projectId|id, input): Promise<ActionResult<…>>
createTask(user, projectId, input) / updateTask(user, taskId, input) / updateTaskProgress(user, taskId, input) / deleteTask(user, taskId)
listPlan(user, projectId, filter?: { status?, assigneeId?, kind? }): Promise<{ milestones: MilestoneView[]; tasks: TaskRow[] }>  // tasks in WBS order with `depth`
getTask(user, projectId, taskCode): Promise<TaskDetail | null>   // includes linked requirements and components (empty until Task 3)
listMyOpenTasks(user): Promise<MyTask[]>                          // not DONE, across visible projects
// src/components/reference-panel.tsx
<ReferencePanel title="การอ้างอิง" groups={[{ label, items: [{ code, text, href }] }]} />
```
Nav: project section gains `แผนงาน` (`/plan`, icon `account_tree`); breadcrumbs `แผนงาน` and task code.

- [ ] Step 1: Failing tests in `tests/plan.test.ts`: codes `M1`,`M2`, `T-001`…; non-PM create is forbidden; assignee updates progress fields only (an attempt to change `title` through `updateTaskProgress` is impossible by type and through `updateTask` is forbidden); DONE forces percent 100; percent outside 0–100 and day values not multiple of 0.5 rejected; plannedEnd before plannedStart rejected; parent in another project rejected; parent cycle rejected; deleting a task with children rejected with the children's codes; WBS order: sorted by `wbsCode` numeric segments (`2.10` after `2.9`), tasks without `wbsCode` last by code; `depth` from parent chain; filters; cross-project id access returns the forbidden error; `listMyOpenTasks` excludes DONE and other users.
- [ ] Step 2: fail. Step 3: implement services, actions, pages: `/plan` = card `Milestone` (table: รหัส, ชื่อ, วันตามแผน, วันปรับแผน, วันจริง) + card `Task` (indented table: รหัส, WBS, ชื่องาน, ชนิด, ผู้รับผิดชอบ, แผน, สถานะ, %; filters สถานะ/ผู้รับผิดชอบ/ชนิด via query string); buttons `เพิ่ม Milestone`, `เพิ่ม Task` only for PM; task detail page shows all fields, a progress form for PM/assignee, and `ReferencePanel`. Step 4: tests, lint, build. Step 5: Commit `feat(plan): milestones, WBS tasks, task detail`.

### Task 3: Agreement items, requirements, components, links

**Files:** Create `src/features/trace/{service,actions}.ts`, pages `requirements/page.tsx`, `requirements/[reqCode]/page.tsx`, `components/page.tsx`, `components/[compCode]/page.tsx` under `src/app/(app)/projects/[code]/`, dialogs beside them, `tests/trace.test.ts`. Modify `plan/[taskCode]/page.tsx` (link editing), nav-model (+ test), labels.

**Interfaces:** produces
```ts
create/update/deleteAgreementItem, create/update/deleteRequirement, setRequirementStatus(user, id, status), create/update/deleteComponent
setTaskRequirements(user, taskId, requirementIds[]) ; setTaskComponents(user, taskId, componentIds[]) ; setRequirementComponents(user, requirementId, componentIds[])   // replace-all semantics
listAgreementItems / listRequirements / listComponents (user, projectId)
getRequirement(user, projectId, code) / getComponent(user, projectId, code)   // with linked items both directions
```
Nav: `Requirement` (`/requirements`, icon `checklist`), `Component` (`/components`, icon `widgets`).

- [ ] Step 1: Failing tests: codes `AG-01`, `REQ-F01`, `REQ-N01` (separate counters per type; type cannot change after creation), `C01`; AN/TL allowed, PM/PR/QA/VIEWER forbidden for manage; approve allowed for TL and PM only; APPROVED requirement text edit rejected, allowed again after status → PROPOSED; link setters reject ids from another project and are idempotent; delete of AG with requirements, requirement with tasks/components, component with tasks/requirements each rejected with referencing codes; delete of a task with links (update Task 2's `deleteTask`) rejected the same way; `getRequirement` returns AG, tasks, components (direct and via tasks, de-duplicated).
- [ ] Step 2: fail. Step 3: implement. `/requirements`: card `ขอบเขตตาม Agreement` (รหัส, รายละเอียด) and card `Requirement` (รหัส, ประเภท, รายละเอียด, ลำดับความสำคัญ, AG, สถานะ). Detail pages show fields + `ReferencePanel` (groups: Agreement, Task, Component / Requirement, Task) and, for AN/TL, a multi-select dialog `แก้การอ้างอิง`. Task detail gains the same dialog for its requirements and components. Step 4: tests, lint, build. Step 5: Commit `feat(trace): agreement items, requirements, components, links`.

### Task 4: Trace view and "งานของฉัน"

**Files:** Create `src/features/trace/matrix.ts`, `src/app/(app)/projects/[code]/trace/page.tsx`, `tests/trace-matrix.test.ts`. Modify `src/app/(app)/page.tsx`, nav-model (+ test).

**Interfaces:**
```ts
export type TraceRow = { ag: Ref | null; requirement: Ref | null; tasks: Ref[]; components: Ref[]; gaps: Gap[] };
export type Gap = "REQ_NO_AG" | "REQ_NO_TASK" | "REQ_NO_COMPONENT" | "AG_NO_REQ" | "DEV_TASK_NO_REQ";
export function buildTraceMatrix(user, projectId): Promise<{ rows: TraceRow[]; orphanDevTasks: Ref[] }>;
```
One row per requirement (DROPPED excluded), ordered by AG code then requirement code; AG items with no requirement get a row with `requirement: null`; components = direct ∪ via tasks. Nav: `การอ้างอิง` (`/trace`, icon `hub`).

- [ ] Step 1: Failing tests for every gap kind, ordering, de-duplication, DROPPED exclusion, orphan DEV tasks, cross-project isolation. Step 2: fail. Step 3: implement; page = read-only table (AG, Requirement, Task, Component) where each code links to its detail page and gap cells show a warning badge (`ยังไม่มี Task`, `ยังไม่มี Component`, `ยังไม่มี Requirement`, `ไม่ได้โยง AG`), plus a card listing DEV tasks without a requirement; home page gains card `งานของฉัน` (รหัสโครงการ, รหัส Task, ชื่องาน, กำหนดเสร็จ, สถานะ; empty text `ไม่มีงานค้าง`). Step 4: tests, lint, build. Step 5: Commit `feat(trace): traceability view, my tasks`.

### Task 5: Template store

**Files:** Create `templates/` (copy of `../repository/FRA_flora_01` — 9 phase folders, 54 `.docx`; exclude `.claude/` and any non-docx), `src/lib/template-store.ts`, `src/app/api/templates/[wp]/[name]/route.ts`, `src/app/(app)/admin/templates/page.tsx`, `tests/template-store.test.ts`. Modify documents page/accordion (buttons), nav-model (+ test), `docker-compose.yml` (`./templates:/data/templates:ro` bind mount and `TEMPLATES_DIR: /data/templates`), `Dockerfile`/`.dockerignore` only if needed, `.env.example`, `README.md`.

**Interfaces:**
```ts
export type WpFiles = { wpCode: string; template: string | null; extraTemplates: string[]; samples: string[] };
export function scanTemplates(): Promise<Map<string, WpFiles>>;            // empty map when TEMPLATES_DIR missing/unreadable
export function resolveTemplateFile(wpCode: string, name: string): Promise<string | null>; // absolute path only if (wpCode,name) is in the scan result and realpath stays inside TEMPLATES_DIR
```
Rules (spec 5.1): a directory at any depth whose name contains `WP` + two digits belongs to that WP; inside it, files starting with `WPnn_` are templates (first by name is `template`, the rest `extraTemplates`), other files are samples; skip dotfiles, `~$*`, subdirectories, non-regular files. `TEMPLATES_DIR` default `./templates`. No caching across requests.

- [ ] Step 1: Failing tests using a temp directory built in the test: matching rules above; nested phase folders; two templates → `extraTemplates`; `~$x.docx` and dotfiles skipped; missing dir → empty map; `resolveTemplateFile` returns null for names not in the scan, for `../` names, absolute paths, and a symlink escaping the root; a test that the repo's own `templates/` yields a template for each of the 23 WP codes in `WP_CATALOG`.
- [ ] Step 2: fail. Step 3: implement. Download route: any logged-in user; `Content-Disposition` attachment with RFC 5987 encoded file name; 404 otherwise. Documents page: in each expanded WP row, button `ดาวน์โหลด template` and a list `ตัวอย่าง (n)` with one link per file; nothing shown when absent. `/admin/templates` (ADMIN; nav `Template` icon `folder_copy`): shows the resolved `TEMPLATES_DIR`, and a table of the 23 WPs: template file, a warning when `extraTemplates` is non-empty or template is missing, sample count. README section `คลัง template`: folder location, naming rule, how to replace a file, Docker bind mount and that files must be readable by uid 1001.
- [ ] Step 4: tests, lint, build. Step 5: Commit `feat(templates): template and sample store per WP`.

### Task 6: Change own password, e2e, docs

**Files:** Create `src/app/(app)/account/password/{page.tsx,password-form.tsx}`, `e2e/release2a.spec.ts`. Modify `src/features/users/service.ts` (+ `tests/users.test.ts`), `src/features/auth/actions.ts` or users actions, `src/components/shell/user-menu.tsx`, nav-model breadcrumbs (+ test), `README.md`, `docs/superpowers/backlog/release-1-followups.md` (remove the items this plan closes).

**Interfaces:** `changeOwnPassword(user, { current, next, currentSessionToken }): Promise<ActionResult<null>>` — wrong current → `รหัสผ่านเดิมไม่ถูกต้อง`; `next` uses the same rule as admin reset; same as current → `รหัสผ่านใหม่ต้องต่างจากรหัสเดิม`; on success deletes the user's other sessions and keeps the current one.

- [ ] Step 1: Failing unit tests for the four behaviours above plus "other user's sessions untouched". Step 2: fail. Step 3: implement; user menu gains `เปลี่ยนรหัสผ่าน`; page shows success text `เปลี่ยนรหัสผ่านแล้ว`.
- [ ] Step 4: E2E `release2a.spec.ts` (make sure the Playwright config matches the file): as PM/AN/TL users created by the test — create milestone and task; create AG, requirement, component; link them; open `/trace` and see one complete row with no gap badge and the codes `AG-01`, `REQ-F01`, `T-001`, `C01`; an assignee without PM role updates progress; download the WP07 template from the documents page (response 200, docx content type); change own password and log in with the new one; at 390 px the plan table's action column stays inside the viewport.
- [ ] Step 5: `npm test`, `npm run lint`, build, `npm run test:e2e` all pass. Step 6: Commit `feat(account): change own password; e2e for release 2A`.
