# Release 2B: Meeting Record + template filling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meeting Record (WP07) as a full web form with automatic `MR-<พ.ศ.>-nn` numbers, open issues that become Tasks by a button, carry-forward of open issues, approval that freezes a docx, and docx export produced by filling the WP07 template file.

**Architecture:** New `meeting`, `meeting_attendee`, `meeting_item` tables; `src/features/meetings/service.ts` holds all rules. A generic filler `src/lib/docfill.ts` (docxtemplater + pizzip) fills any tagged docx; each generated WP registers its tags, sample data and blank data in `src/features/docgen/registry.ts`. The template file is resolved through the existing template store (override beats default).

**Tech Stack:** Next.js 16.4.6 App Router (read `node_modules/next/dist/docs/` before writing route/page code), Prisma 6 / PostgreSQL, zod, react-bootstrap + project theme, Vitest on real DB `esm_test`, Playwright (port 3100, `NEXT_DIST_DIR=.next-e2e`), new deps `docxtemplater`, `pizzip`.

**Spec:** `docs/superpowers/specs/2026-11-24-release-2-plan-trace-meeting-design.md` (sections 5.1 last two bullets, 5.2, 5.4, 5.5 rules 1–3 and 6, 5.6, 5.7, 5.8). Parent: `docs/superpowers/specs/2026-11-23-project-management-system-design.md`.

## Global Constraints

- Services live in `src/features/<area>/service.ts`, import nothing from `next/*`, return `ActionResult` (`ok` / `fail` from `src/lib/result.ts`). Server actions are thin (`requireUser()`), follow `src/features/plan/actions.ts`.
- Every reference to another row (member, task, previous meeting, carried-from item) is checked to be in the same project in the service, with a test. Foreign keys to sibling rows use `onDelete: NoAction`; children of a meeting use `Cascade`; every new table carries `projectId`.
- Codes are issued once with `nextCode(tx, projectId, "MR", buddhistYear)` inside the creating transaction, never edited, never reused.
- UI text is Thai; dates print as `DD/MM/YYYY` พ.ศ. via `formatThaiDate`. Use the components in `src/components/` and README "แนวทาง UI". Dialog cancel is `ยกเลิก`.
- An exported document must contain every heading and table header of the template; a broken template must produce a Thai message naming the WP and the cause, never a crash or a corrupt file.
- Tests: `npm test` (all pass), `npm run lint` (clean), `NEXT_DIST_DIR=.next-e2e npm run build`, `npm run test:e2e`.
- PROCESS SAFETY: never kill a PID found by `lsof`/`ps`/port lookup; no `pkill`/`killall`; stop only processes whose PID you captured when you started them. Never touch the dev server on port 3000, never run `docker compose down`, never touch containers other than `esm-project-postgres-1`, never reset database `esm` (apply migrations with `prisma migrate deploy` / `migrate dev` only).
- Commit trailer: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A meeting with no attendees, no items of some kind, or no next meeting must still export a valid docx (every table cell keeps a paragraph; no leftover `{tag}`).
2. Text typed by users containing `{`, `}`, `<`, `&` or line breaks must appear literally in the docx and not break filling.
3. An admin override template with a missing, misspelled or unclosed tag: export and the WP07 "ดาวน์โหลด template" answer with a Thai message that names the tag; the admin page shows it; nothing throws.
4. An Approved meeting cannot be changed through any action (header, attendees, items, link/create task, delete), also when the request is sent directly; only signed attachments may still be added.
5. Meeting on 31/12 vs 01/01 gets the number of its own พ.ศ. year; two meetings created at the same time get different numbers.

---

### Task 1: Schema, permissions, labels

**Files:** Modify `prisma/schema.prisma`, `src/lib/authz.ts`, `src/lib/labels.ts`, `src/features/plan/service.ts` (deleteTask), `tests/authz.test.ts`, `tests/plan.test.ts`, `tests/schema-cascade.test.ts`. Create migration `release_2b_meetings`.

**Produces:**

```prisma
enum MeetingStatus { DRAFT APPROVED }
enum MeetingItemKind { ACCOMPLISHED ISSUE OPEN_ISSUE AGREEMENT }
enum OpenIssueStatus { OPEN CLOSED }

model Meeting {
  id, projectId (Cascade), code            // @@unique([projectId, code])
  topic String, meetingDate DateTime @db.Date
  startTime String?, endTime String?       // "HH:MM"
  place, recorder, organizer, purpose String?
  previousId String?  (self relation "MeetingChain", NoAction)
  previousNote String?
  nextTopic String?, nextDate DateTime? @db.Date, nextStartTime, nextEndTime, nextPlace String?
  status MeetingStatus @default(DRAFT)
  approvedAt DateTime?, approvedById String? (User), approvedFileId String? @unique (Attachment, SetNull)
  attendees MeetingAttendee[], items MeetingItem[]
}
model MeetingAttendee {
  id, meetingId (Cascade), projectId, order Int
  userId String? (User, SetNull), fullName String
  position, organization, projectRole String?, present Boolean @default(true)
}
model MeetingItem {
  id, meetingId (Cascade), projectId, kind MeetingItemKind, order Int, text String
  ownerId String? (User, SetNull), ownerName String?, dueDate DateTime? @db.Date
  status OpenIssueStatus @default(OPEN)
  taskId String? (Task, NoAction)          // spec's linked_type/linked_id: only tasks this release
  carriedFromId String? (self relation "IssueCarry", NoAction)
  @@index([taskId])
}
```

- `Action` gains `"meeting.manage"` (PM, AN) and `"meeting.approve"` (PM).
- `labels.ts`: `MEETING_STATUS_LABEL` (`DRAFT` → `Draft`, `APPROVED` → `Approved`), `MEETING_ITEM_KIND_LABEL`, `OPEN_ISSUE_STATUS_LABEL` (`OPEN` → `ค้าง`, `CLOSED` → `ปิดแล้ว`).
- `deleteTask` also refuses when meeting items point at the task; the message lists the meeting codes (`ลบไม่ได้: ถูกอ้างจาก MR-2569-01`).

- [ ] Tests first: authz table rows for both actions × 6 roles + ADMIN + non-member; `deleteTask` with a linked meeting item fails with the meeting code; deleting a project with meetings, attendees, items (incl. carried and task-linked) succeeds (cascade test).
- [ ] Schema + migration (apply to `esm` with migrate, and to `esm_test` the way `tests/setup` does), implement, run `npm test`, lint, commit.

### Task 2: Meeting service

**Files:** Create `src/features/meetings/service.ts`, `tests/meetings.test.ts`. Modify `src/features/documents/service.ts` (`addAttachment` accepts entity `meeting`), `tests/documents.test.ts`.

**Produces (all `Promise<ActionResult<…>>` unless noted; `user: User` first):**

```ts
export const MEETING_ENTITY = "meeting";
createMeeting(user, projectId, input: { topic: string; meetingDate: Date; previousId?: string | null }): Meeting
updateMeeting(user, meetingId, input: MeetingInput): Meeting        // every header field except code/status
deleteMeeting(user, meetingId): null
addAttendee(user, meetingId, input: AttendeeInput) / updateAttendee(user, attendeeId, input) / removeAttendee(user, attendeeId)
addItem(user, meetingId, input: ItemInput) / updateItem(user, itemId, input) / removeItem(user, itemId)
linkIssueToTask(user, itemId, taskId: string | null): MeetingItem
createTaskFromIssue(user, itemId, input: { title: string; assigneeId?: string | null; plannedEnd?: Date | null }): Task
effectiveIssueStatus(item: { status: OpenIssueStatus; task: { status: TaskStatus } | null }): OpenIssueStatus   // pure
listMeetings(user, projectId): Promise<MeetingRow[]>        // [] when the user cannot view
getMeeting(user, projectId, code): Promise<MeetingDetail | null>
listIssuesForTask(taskId): Promise<{ meetingCode: string; text: string }[]>
```

**Rules (each has a test):**
- Create/update/attendees/items/link/create-task need `meeting.manage`; reads need `project.view`.
- Number: พ.ศ. year = calendar year of `meetingDate` + 543 (the date is stored as a plain date; 31/12/2026 → `MR-2569-nn`, 01/01/2027 → `MR-2570-01`); two-digit number; changing the date later keeps the code. 10 concurrent `createMeeting` calls give 10 different codes.
- Carry-forward: when `previousId` is given at creation, every `OPEN_ISSUE` of that meeting whose effective status is `OPEN` is copied (text, owner, due date, task link, `carriedFromId`) in the same transaction. Done once: later edits of either meeting do not sync. The previous meeting need not be Approved. Changing `previousId` in `updateMeeting` does not copy.
- `effectiveIssueStatus`: linked task → `CLOSED` iff task status is `DONE`, else `OPEN`; no task → stored status. `updateItem` rejects a status change while a task is linked (`สถานะตาม Task ที่โยงอยู่`).
- `ownerId`, `dueDate`, `status`, `taskId` are only accepted for `OPEN_ISSUE`; for other kinds they are stored null/default.
- `addAttendee` with `userId`: must be a project member; `fullName` defaults to the user's name, `position` to the user's position (if the User model has one), `projectRole` to the label of the member's first role; all editable. Without `userId`: `fullName` required.
- `createTaskFromIssue`: allowed with `meeting.manage` (AN included, although AN lacks `plan.manage`); creates a Task of kind `PLAN`, status `TODO`, code from `nextCode(tx, projectId, "T")`, and sets `item.taskId`, all in one transaction; fails if the item already has a task. Assignee must be a member with a working role (reuse the check in `plan/service.ts`; export it if needed).
- Approved meeting: every mutation above fails with `การประชุมที่อนุมัติแล้วแก้ไม่ได้`.
- `deleteMeeting`: `meeting.manage`; only `DRAFT`; refused when an item of it is `carriedFrom` of another meeting's item or another meeting has it as `previousId` → `inUse([those meeting codes])`. Linked tasks stay. Stored files of its attachments are deleted.
- Order: new attendees/items get `max(order)+1` within their meeting (items: within their kind). No reordering in this release.
- `addAttachment` with `entityType: "meeting"`: entity must be a meeting of that project; permission `attachment.add`; allowed for Draft and Approved.

- [ ] Write `tests/meetings.test.ts` for the rules above, see them fail, implement, pass, lint, commit.

### Task 3: Template filler, tagged WP07 template, template check

**Files:** Create `src/lib/docfill.ts`, `src/features/docgen/registry.ts`, `src/features/meetings/wp07.ts`, `tests/docfill.test.ts`, `tests/wp07.test.ts`. Replace `templates-default/02_…/05_WP07_Meeting Record/WP07_meeting_record.docx` with the tagged version. Modify `src/app/api/templates/[wp]/[name]/route.ts`, `src/app/(app)/admin/templates/page.tsx`, `tests/template-store.test.ts` if affected, `package.json`.

**Produces:**

```ts
// src/lib/docfill.ts
export class TemplateError extends Error { problems: string[] }      // Thai, one line per problem
export function listTags(docx: Buffer): string[]                     // unique tag names incl. loop names and tags inside loops, body + header + footer
export function fillTemplate(docx: Buffer, data: Record<string, unknown>): Buffer   // throws TemplateError

// src/features/docgen/registry.ts
export type GeneratedWp = { wpCode: string; tags: { name: string; meaning: string }[]; sample: Record<string, unknown>; blank: Record<string, unknown> };
export const GENERATED_WPS: Record<string, GeneratedWp>              // { WP07 }
export type TemplateCheck = { ok: true } | { ok: false; problems: string[] };
export async function checkTemplate(wpCode: string): Promise<TemplateCheck>   // missing file, missing tags, unknown tags, sample fill
export async function loadTemplate(wpCode: string): Promise<Buffer>           // via template store; throws TemplateError `ไม่พบไฟล์ template ของ WP07`

// src/features/meetings/wp07.ts
export function meetingDocData(m: MeetingDocSource): Record<string, unknown>  // pure
export const WP07: GeneratedWp
```

**Tags (exact names):** header `{mrNo}` `{docDate}`; info table `{projectName}` `{projectCode}` `{topic}` `{meetingDate}` `{meetingTime}` `{place}` `{recorder}` `{organizer}` `{draftBox}` `{approvedBox}`; 1 `{purpose}`; 2 `{#attendees}` `{no}` `{name}` `{position}` `{organization}` `{role}` `{/attendees}` and `{absentees}`; 3 reuses `{meetingDate}` `{meetingTime}` `{place}`; 4 `{previousRef}`; 5 `{#accomplished}{text}{/accomplished}`; 6 `{#issues}{text}{/issues}`; 7 `{#openIssues}` `{no}` `{text}` `{owner}` `{due}` `{status}` `{/openIssues}`; 8 `{#agreements}{text}{/agreements}`; 9 `{nextTopic}` `{nextDate}` `{nextTime}` `{nextPlace}`.

**Values:**
- `draftBox` / `approvedBox`: `☑` for the current status, `☐` for the other; blank data: both `☐`.
- `meetingTime`: `09:30 – 11:30 น.`; only start → `09:30 น.`; none → empty. Same for `nextTime`.
- `docDate` = meeting date. `mrNo` = code.
- `attendees` = present attendees in order, `no` from 1; `absentees` = names of absent attendees joined by `, `.
- `previousRef`: previous meeting → `MR-2569-01 วันที่ 15/12/2569`, plus ` – <previousNote>` when a note exists; no previous → the note, or `ไม่มี`.
- `openIssues.status`: effective status label; with a linked task append the code: `ค้าง (T-012)`.
- null/undefined → empty string (never the word `undefined`).
- Blank data: all scalars empty, each list has 3 rows of empty strings (`no` = 1..3 for tables).

**Template file:** edit the docx XML directly (see the docx skill: unpack, edit `word/document.xml` and `word/header1.xml`, repack; do not reformat). Three required differences from the current file (spec 5.8): the two checkbox content controls become plain-text runs holding `{draftBox}` / `{approvedBox}` (same font size as the neighbouring text); tag runs use normal style (remove the gray italic of the sample text); nested tables keep one data row carrying the loop; bullet lists keep one bullet paragraph carrying the loop. Header: `MR-YYYY-NNN` → `{mrNo}`, `DD/MM/YYYY` → `{docDate}`; `[LOGO]`, company name and Version `1.0` stay as they are. Everything else (headings, widths, signature block, footer) unchanged. Keep each tag inside one `<w:t>`.

- [ ] `npm install docxtemplater pizzip`. Read the docxtemplater docs in `node_modules/docxtemplater` (README, `js/inspect-module.js`, error handling: `error.properties.errors`) before coding. Use `paragraphLoop: true`, `linebreaks: true`, a `nullGetter` returning `""`.
- [ ] `tests/docfill.test.ts` on small docx fixtures built in the test with pizzip: fills scalars and loops; user text with `{`, `}`, `<`, `&`, newline appears literally; unclosed tag / unopened loop → `TemplateError` whose problems name the tag; `listTags` returns scalar, loop and inner tags, and tags split by Word across runs.
- [ ] `tests/wp07.test.ts` against the shipped template: `checkTemplate("WP07")` is ok; filling the sample leaves no `{`…`}` in body/header text, contains the nine English headings (`Purpose of meeting` … `Next meeting, if any`) and both nested table header rows (`ลำดับ`, `ชื่อ-สกุล`, `ตำแหน่ง`, `หน่วยงาน`, `บทบาทในโครงการ`; `ประเด็นค้าง`, `ผู้รับผิดชอบ`, `กำหนดชี้แจง`, `สถานะ`) and the sample values; filling a meeting with empty lists yields XML where every `<w:tc>` contains a `<w:p>` and the file re-opens with pizzip; blank data yields 3 numbered empty rows; a copy of the template with `{purpose}` removed, placed in a temp `TEMPLATES_DIR`, makes `checkTemplate` report `purpose`, and one with an extra `{foo}` reports `foo`; `meetingDocData` unit cases for every value rule above.
- [ ] Render the filled sample to PDF with LibreOffice if `soffice` is available and look at the pages next to the original template; note in the report whether this was done.
- [ ] Template download route: when the WP is in `GENERATED_WPS` and the requested name is its template, respond with `fillTemplate(file, blank)`; on `TemplateError` respond `422` `text/plain; charset=utf-8` with the Thai problems. Samples and other WPs unchanged. Add route tests in the style of the existing ones (or service-level tests if the route has none).
- [ ] `/admin/templates`: new column `ผลตรวจ` — for generated WPs a `ผ่าน` chip or a danger chip `ไม่ผ่าน` with the problems listed under it; other WPs empty. Below the table a card `เครื่องหมายของ WP07 Meeting Record` listing tag and meaning. A `ตรวจอีกครั้ง` link reloads the page (the page already reads fresh on every request).
- [ ] `npm test`, lint, commit.

### Task 4: Approve, freeze, export

**Files:** Modify `src/features/meetings/service.ts`, `tests/meetings.test.ts`. Create `src/features/meetings/actions.ts`, `src/app/api/meetings/[id]/export/route.ts`.

**Produces:**

```ts
approveMeeting(user, meetingId): Meeting     // meeting.approve
revertMeeting(user, meetingId): Meeting      // meeting.approve
exportMeeting(user, meetingId): ActionResult<{ fileName: string; data: Buffer }>   // project.view
```

- `approveMeeting`: only from `DRAFT`; fills WP07 with the meeting as Approved, stores it with `saveFile` as an `Attachment` (entity `meeting`, kind `OTHER`, mime docx, file name `<projectCode>_<MR code>.docx`), sets `status`, `approvedAt`, `approvedById`, `approvedFileId`. Template failure → `fail` with the Thai problems, status unchanged, no file left behind.
- `revertMeeting`: only from `APPROVED`; back to `DRAFT`, removes the frozen attachment and its file, clears the approval fields.
- `exportMeeting`: Approved → the stored file byte-for-byte (unchanged when the template or a linked task changes later — test both); Draft → filled now. A missing stored file → `fail('ไม่พบไฟล์ฉบับอนุมัติ')`.
- The frozen copy is not listed among the meeting's user attachments (filter by `approvedFileId`).
- Route: follow `src/app/api/files/[id]/route.ts` (own authentication, 404 for unknown/not allowed, `Content-Disposition` via `encodeRFC5987`, `no-store`); a `fail` from the template → `422` plain text. Check `src/proxy.ts` matcher so an unauthenticated request gets 404, as for `api/templates/`.
- Actions for everything in Tasks 2 and 4, `FormState` style, `revalidatePath` of the meeting pages (and plan pages after create/link task).

- [ ] Tests first (approve/revert/export rules above, permission per role, Review Focus 4), implement, `npm test`, lint, commit.

### Task 5: Screens, e2e, docs

**Files:** Create `src/app/(app)/projects/[code]/meetings/page.tsx`, `meetings/[no]/page.tsx` and their dialog/form client components, `e2e/release2b.spec.ts`. Modify `src/components/shell/nav-model.ts` (+ `tests/nav-model.test.ts`), `src/components/status-badge.tsx` if a variant is needed, `src/app/(app)/projects/[code]/plan/[taskCode]/page.tsx`, `README.md`, spec section 5.1.

- Nav: `การประชุม` (icon `groups`) after `การอ้างอิง`; breadcrumbs `การประชุม` / `MR-2569-01`.
- List page: table เลขที่, วันที่, หัวข้อ, สถานะ, newest first; button `สร้างการประชุม` (dialog: หัวข้อ, วันที่, การประชุมครั้งก่อน = select of existing meetings or `ไม่มี`, with the hint `ประเด็นค้างที่ยังไม่ปิดจะถูกยกมา`) for users with `meeting.manage`; after creating, go to the detail page.
- Detail page, one page ordered like the template: header card (project, code, topic, date/time, place, recorder, organizer, status chip) then cards 1–9: 1 วัตถุประสงค์; 2 ผู้เข้าร่วม (table with เข้าร่วม/ไม่เข้าร่วม; add dialog picks a member — fields prefill — or a typed outside person); 3 shows date/place (read from header); 4 การประชุมครั้งก่อน + หมายเหตุ; 5, 6, 8 simple lists with add/edit/delete; 7 ประเด็นค้าง table (ประเด็น, ผู้รับผิดชอบ, กำหนดชี้แจง, สถานะ, Task) with row buttons `สร้าง Task` (dialog prefilled: ชื่องาน = issue text, ผู้รับผิดชอบ = owner, วันสิ้นสุดตามแผน = due date) and `โยง Task` (select existing task / remove link); a linked row shows the task code as a link to the task page, status follows the task and is not editable; carried rows show `ยกมาจาก MR-…`; 9 การประชุมครั้งต่อไป. Then `ไฟล์แนบ` card (upload with kind, default `ฉบับเซ็น`; list with download).
- Page actions: `ส่งออก docx` (link to the export route, everyone who can view), `อนุมัติ` / `กลับเป็น Draft` (PM), `ลบ` (Draft, `meeting.manage`). Approved or no permission → read-only, no edit controls rendered.
- Task detail page: reference panel gets `ประเด็นประชุมต้นทาง` (meeting code linking to the meeting, issue text).
- Documents page WP07 row: a link `ไปที่การประชุม`.
- e2e (spec 5.7): PM creates a meeting, adds an attendee, an open issue, presses `สร้าง Task`, sees the task code; approves; downloads the docx (response is a zip whose `word/document.xml` contains the topic and the task code); creates the next meeting with the first as previous and sees the carried issue; an Approved meeting shows no edit buttons.
- README: section on generated documents — which WPs are filled from templates, how to edit a template (copy from `templates-default/` into `templates/`, keep the `{tags}`, open `/admin/templates` to check), tag syntax in two lines. Spec 5.1: rewrite the first two bullets to the two-folder layout (`templates-default/` shipped, `templates/` override, per-WP fallback).

- [ ] Build pages and actions wiring, nav tests, e2e; run `npm test`, lint, `NEXT_DIST_DIR=.next-e2e npm run build`, `npm run test:e2e` (all specs); commit.
