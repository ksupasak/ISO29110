# Material Design Admin Theme on Bootstrap 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tailwind + shadcn UI of Release 1 with an admin layout (sidebar + topbar) styled as Material Design on Bootstrap 5, without changing behaviour.

**Architecture:** Bootstrap 5.3 compiled from Sass with project variable overrides plus a small Material layer (`src/styles/`); interactive pieces use `react-bootstrap`. A shared kit in `src/components/` (shell, icon, badges, page header, form dialog) is built first; pages are then migrated group by group; Tailwind and shadcn are deleted last. Services, actions, authz, storage and schema are not touched.

**Tech Stack:** bootstrap 5.3, react-bootstrap, sass, `@fontsource/sarabun`, `material-symbols` (all self-hosted via npm), Next.js 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-material-bootstrap-ui-design.md`

## Global Constraints

- Do not modify anything under `src/features/`, `src/lib/auth/`, `src/lib/authz.ts`, `src/lib/storage.ts`, `src/app/api/`, `prisma/`, or `tests/` (except adding the new test files named in this plan). `src/lib/labels.ts` may be extended.
- Every Thai label, button text, heading and error message stays character-for-character as it is today. `data-testid="phase-heading"` and `data-testid="wp-row"` stay on the same logical elements.
- Permission-driven hiding of controls, the client-side 50 MB check, and every form field name stay as they are.
- No request to any external origin at runtime: fonts, icons and CSS are bundled from npm packages. (Spec said `next/font`; `@fontsource/sarabun` is used instead so the Docker build needs no Google Fonts access — same runtime result.)
- Colours: primary `#1F3864`, secondary `#00897B`, success `#43A047`, warning `#FB8C00`, danger `#E53935`, info `#1E88E5`, page background `#F4F6F9`. Font: Sarabun 400/500/600/700. Icons: Material Symbols Outlined.
- No dark mode. No new features except the three summary cards on the home page.
- After every task: `npm test` (142+), `npm run lint`, `npm run build`, `npm run test:e2e` all pass with pristine output (silence Bootstrap's Sass deprecation noise via `sassOptions`, do not leave warnings). Commit after every task.
- When the plan is complete nothing imports from `@/components/ui`, `cn`, `@/lib/utils`, `lucide-react`, `sonner`, `@base-ui/react`, and no Tailwind utility classes or config remain.
- Next.js here is 16.x: read `node_modules/next/dist/docs` for Sass support, fonts/CSS imports and client/server component rules before writing (see AGENTS.md).

## Review Focus

1. A viewport of 390 px: the sidebar is hidden, the ☰ button opens it, a link in it navigates and closes it; no horizontal scroll on any page. (Task 5 e2e)
2. A WP status the colour map does not know (future statuses) → renders as a neutral badge with the raw text, never crashes. (Task 1 unit test)
3. A form dialog that returned an error keeps the user's typed values and shows the Thai error; reopening after cancel shows a clean form. (Task 1 component behaviour, Task 5 e2e step)
4. A very long project name / file name wraps or truncates with a tooltip instead of breaking the layout. (Task 5 screenshot check with seeded long names)
5. Opening any page makes no request to another origin. (Task 5 e2e assertion)

---

## File Structure

```
src/styles/_variables.scss      Bootstrap variable overrides (colours, radius, shadows, font)
src/styles/_material.scss       Material layer: elevation, card headers, buttons, form-floating, table, badge, sidebar, topbar
src/styles/app.scss             entry: variables → bootstrap → material → fonts/icons
src/components/icon.tsx         <Icon name="folder" /> (Material Symbols span, aria-hidden)
src/components/status-badge.tsx <DocStatusBadge status>, <ProjectStatusBadge status>, <RoleBadge role>
src/components/page-header.tsx  title + optional actions slot
src/components/app-card.tsx     card with optional coloured header and icon
src/components/form-dialog.tsx  REWRITE on react-bootstrap Modal (same props as today)
src/components/shell/sidebar.tsx      client; global links + "โครงการนี้" section from usePathname()
src/components/shell/topbar.tsx       client; ☰ toggle, breadcrumbs, user menu
src/components/shell/app-shell.tsx    layout wrapper (desktop sidebar + Offcanvas on < 992px)
src/lib/labels.ts               + docStatusVariant(), projectStatusVariant()
tests/status-variant.test.ts    unit tests for the two mapping functions
e2e/release1.spec.ts            selectors updated; mobile step; no-external-requests assertion
e2e/screens.spec.ts             captures screenshots to docs/screenshots/ui-v2/
DELETE at the end: src/components/ui/, src/lib/utils.ts, components.json, postcss.config.mjs, Tailwind parts of globals.css, src/app/(app)/projects/[code]/tab-link.tsx, src/app/(app)/user-menu.tsx
```

---

### Task 1: Theme foundation, shared kit, shell, login and error pages

**Files:** Create everything under `src/styles/`, `src/components/icon.tsx`, `status-badge.tsx`, `page-header.tsx`, `app-card.tsx`, `src/components/shell/*`, `tests/status-variant.test.ts`. Modify `src/lib/labels.ts`, `src/components/form-dialog.tsx`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/app/login/*`, `src/app/not-found.tsx`, `src/app/error.tsx`, `next.config.ts`, `package.json`. Delete `src/app/(app)/user-menu.tsx`.

**Interfaces — Produces:**
- `docStatusVariant(status: string): "secondary" | "info" | "success" | "danger"` — `"Draft"` → `secondary`; `isFinalStatus(status)` → `success`, except `"Rejected"` → `danger`; any other string → `info`.
- `projectStatusVariant(status: "PLANNING" | "ACTIVE" | "CLOSED"): "info" | "success" | "secondary"` in that order.
- `<Icon name: string className?: string />`
- `<DocStatusBadge status: string />`, `<ProjectStatusBadge status />` (uses `STATUS_LABEL`), `<RoleBadge role />` (uses the existing role labels)
- `<PageHeader title: string>{actions}</PageHeader>`, `<AppCard title?: string icon?: string headerVariant?: "primary" | "plain">{children}</AppCard>`
- `<FormDialog>` — keep today's prop names and behaviour exactly (read the current file first); additionally reset error and values when it is reopened after a cancel.
- `<AppShell user={{ fullName: string; isAdmin: boolean }}>{children}</AppShell>` — sidebar links `โครงการ` (`/`, icon `folder_open`), `ผู้ใช้งาน` (`/admin/users`, icon `group`, admin only); when the path matches `/projects/<code>` (and code ≠ `new`) a section headed `โครงการนี้` with `ภาพรวม` (`/projects/<code>`, icon `dashboard`) and `เอกสาร` (`/projects/<code>/documents`, icon `description`); the active link has `aria-current="page"`. Topbar: button with `aria-label="เปิดเมนู"` (visible < 992 px) opening a react-bootstrap `Offcanvas` that contains the same nav; breadcrumbs built from the path (`โครงการ`, `ผู้ใช้งาน`, `โครงการ › <CODE>`, `โครงการ › <CODE> › เอกสาร`, `โครงการ › สร้างโครงการ`); user dropdown showing `fullName` with item `ออกจากระบบ` calling the existing `logoutAction`. Brand text in the sidebar: `ESM Project`.

- [ ] **Step 1:** Install `bootstrap@5.3 react-bootstrap sass @fontsource/sarabun material-symbols`. In `next.config.ts` add `sassOptions` that silence dependency deprecations (`quietDeps: true` and `silenceDeprecations` for the categories Bootstrap triggers) so the build output is pristine.
- [ ] **Step 2: Write the failing test** `tests/status-variant.test.ts`:

```ts
import { docStatusVariant, projectStatusVariant } from "@/lib/labels";
test.each([
  ["Draft", "secondary"], ["Reviewed", "info"], ["Verified", "info"], ["Initiated", "info"], ["Unit tested", "info"],
  ["Approved", "success"], ["Baselined", "success"], ["Accepted", "success"], ["Signed", "success"],
  ["Published", "success"], ["Completed", "success"], ["Rejected", "danger"],
  ["SomethingNew", "info"], ["", "info"],
])("docStatusVariant(%s) = %s", (s, v) => expect(docStatusVariant(s)).toBe(v));
test("projectStatusVariant", () => {
  expect(projectStatusVariant("PLANNING")).toBe("info");
  expect(projectStatusVariant("ACTIVE")).toBe("success");
  expect(projectStatusVariant("CLOSED")).toBe("secondary");
});
```

- [ ] **Step 3:** `npm test` → FAIL (functions missing). Implement them in `src/lib/labels.ts`. `npm test` → PASS.
- [ ] **Step 4:** Write `src/styles/*`: override `$primary` … `$body-bg`, `$font-family-sans-serif: "Sarabun", system-ui, sans-serif`, `$border-radius: .5rem`, `$card-border-width: 0`; Material layer: `.elevation-1/2/3` shadows, cards use elevation-1, `.card-header-primary` (primary background, white text, icon chip), buttons uppercase-free with medium weight and elevation on hover, `form-floating` as the default field style, dense table inside cards, sidebar 260 px fixed on ≥ 992 px with primary background and a lighter active item, topbar white with elevation-1, body background `#F4F6F9`. Import Sarabun weights 400/500/600/700 and the Material Symbols Outlined CSS from the npm packages.
- [ ] **Step 5:** Build the shared components and the shell; switch `src/app/layout.tsx` to import `@/styles/app.scss` (keep `lang="th"` and the title) and `src/app/(app)/layout.tsx` to render `<AppShell>` (pass only `fullName` and `isAdmin`, never the full user). Restyle login (centred card, primary header with the system name, floating-label fields; labels `ชื่อผู้ใช้`, `รหัสผ่าน`, button `เข้าสู่ระบบ`, same error text), `not-found.tsx` and `error.tsx` (centred card, same texts).
- [ ] **Step 6:** The pages not yet migrated still import shadcn components; they must keep compiling and working (Tailwind stays installed until Task 5). Update `e2e/release1.spec.ts` only where the shell changed (logout is now in the topbar dropdown; navigation to the documents page is via the sidebar link `เอกสาร`).
- [ ] **Step 7:** `npm test && npm run lint && npm run build && npm run test:e2e` → all pass. Commit `feat(ui): bootstrap material theme, app shell, login`.

---

### Task 2: Home, users and new-project pages

**Files:** Modify `src/app/(app)/page.tsx`, `src/app/(app)/admin/users/page.tsx`, `src/app/(app)/admin/users/user-dialogs.tsx`, `src/app/(app)/projects/new/page.tsx`, `src/app/(app)/projects/new/new-project-form.tsx`.

**Interfaces — Consumes:** `PageHeader`, `AppCard`, `Icon`, `ProjectStatusBadge`, `FormDialog`, Bootstrap grid/table/form classes.

- [ ] **Step 1:** Home: `PageHeader` `โครงการ` with the admin-only button `สร้างโครงการ`; a row of three summary cards — `โครงการทั้งหมด` (icon `folder_open`), `กำลังดำเนินการ` (icon `play_circle`), `ปิดโครงการแล้ว` (icon `task_alt`) — counted from the list `listVisibleProjects` already returns (no new query); then the project cards in a responsive grid (`row-cols-1 row-cols-md-2 row-cols-xl-3`), each a link card with code, name, `ProjectStatusBadge` and the date range; the empty state text `ยังไม่มีโครงการ` stays.
- [ ] **Step 2:** Users: table inside an `AppCard`, status shown as badge, row actions as icon buttons that keep their accessible names (the current button texts become `aria-label` + `title`; visible text may be dropped only for row actions). Port `user-dialogs.tsx` to the shared `FormDialog` (one implementation of the dialog pattern), keeping every field name, label and message.
- [ ] **Step 3:** New project: form in an `AppCard` with floating labels and a two-column grid on ≥ 768 px; same fields, names, labels, error display.
- [ ] **Step 4:** Update e2e selectors only where needed. `npm test && npm run lint && npm run build && npm run test:e2e` → pass. Commit `feat(ui): home dashboard cards, users and new-project pages`.

---

### Task 3: Project overview and team

**Files:** Modify `src/app/(app)/projects/[code]/layout.tsx`, `page.tsx`, `edit-project-dialog.tsx`, `team-dialogs.tsx`. Delete `tab-link.tsx`.

- [ ] **Step 1:** The project layout no longer renders tabs (the sidebar section replaces them); it keeps the access check and renders a `PageHeader` with `<code> — <name>` and the `ProjectStatusBadge`.
- [ ] **Step 2:** Overview: `AppCard` `ข้อมูลโครงการ` showing the facts as a two-column definition grid (same labels and formatting, budget via the existing `formatBaht`), with the PM-only edit button in the card header; `AppCard` `ทีมงาน` with the table (`RoleBadge` per role, primary role emphasised, rate column only when visible) and the PM-only add/edit/remove controls.
- [ ] **Step 3:** Dialogs use the shared `FormDialog`; role checkboxes as Bootstrap switches or checks, primary-role select as `form-select`; same field names and messages.
- [ ] **Step 4:** Update e2e selectors where needed. All four commands pass. Commit `feat(ui): project overview and team`.

---

### Task 4: Document store

**Files:** Modify `src/app/(app)/projects/[code]/documents/page.tsx`, `doc-controls.tsx`.

- [ ] **Step 1:** Nine phases as a react-bootstrap `Accordion` (`alwaysOpen`, all open by default); each header keeps `data-testid="phase-heading"` and the text format `01 Project Planning (PM.01)`, plus a count pill `n WP`.
- [ ] **Step 2:** Each WP is a list row (`data-testid="wp-row"`): `01 · WP02 Agreement`, `DocStatusBadge`, current version, the `ระบบสร้างให้` badge when generated, and the action buttons (`อัปโหลดเวอร์ชันใหม่`, `แนบหลักฐาน`, status selector) with the same visibility rules. Expanding a row (Bootstrap collapse, button with `aria-expanded`) shows version history as a small table (version, file link, note, uploader, date) and the attachments list with kind badges.
- [ ] **Step 3:** Long file names truncate with `text-truncate` and carry the full name in `title`.
- [ ] **Step 4:** Update e2e selectors where needed (the scenario must still upload, read back `1.0`, download with the Thai name, and set `Reviewed`). All four commands pass. Commit `feat(ui): document store accordion`.

---

### Task 5: Remove Tailwind/shadcn, responsive and offline checks, screenshots

**Files:** Delete `src/components/ui/`, `src/lib/utils.ts`, `components.json`, `postcss.config.mjs`, `src/app/globals.css` (or reduce to nothing and remove its import). Modify `package.json`, `e2e/release1.spec.ts`, `README.md`. Create `e2e/screens.spec.ts`, `docs/screenshots/ui-v2/*.png`.

- [ ] **Step 1:** Remove the packages `tailwindcss @tailwindcss/turbopack tw-animate-css shadcn cn class-variance-authority lucide-react sonner next-themes @base-ui/react` and every import of them. `grep -rE "components/ui|from \"cn\"|lib/utils|lucide-react|sonner|@base-ui" src e2e` must print nothing; `grep -rE "className=\"[^\"]*\\b(flex|grid|gap-[0-9]|px-[0-9]|text-sm|rounded-md)\\b" src` must print only Bootstrap-valid uses (`d-flex` etc. are fine; bare Tailwind utilities are not).
- [ ] **Step 2: Extend the e2e** (write first, see it fail where behaviour is missing):
  - a request listener on every page of the scenario collecting URLs whose origin differs from the base URL (ignore `data:` and `blob:`); at the end `expect(external).toEqual([])`;
  - a dialog step: open the create-user dialog, submit a duplicate username, assert the error `ชื่อผู้ใช้นี้ถูกใช้แล้ว` is shown and the typed full name is still in the field; cancel; reopen; assert the fields are empty and no error is shown;
  - a mobile step at viewport 390×844: sidebar link `เอกสาร` is not visible; click the button named `เปิดเมนู`; click `เอกสาร` in the opened menu; assert the URL ends with `/documents`, the menu is closed, and `document.documentElement.scrollWidth <= window.innerWidth`.
- [ ] **Step 3:** `e2e/screens.spec.ts` (tagged so it runs only via `npm run screens`, script added): seeds one project named `ระบบติดตามงานและคลังเอกสารโครงการภายในสำหรับทดสอบชื่อที่ยาวมากเป็นพิเศษ` with an uploaded file whose name is 120 characters long, then saves full-page screenshots of login, home, users, project overview, documents (one WP expanded), and an open dialog, at 1440×900 and 390×844, into `docs/screenshots/ui-v2/` (`<page>-desktop.png`, `<page>-mobile.png`). Look at every screenshot: no overflow, no broken layout, Thai text in Sarabun, icons rendered (not ligature text). Fix what is wrong and re-capture.
- [ ] **Step 4:** README developer section: replace Tailwind/shadcn mentions with the Bootstrap theme location (`src/styles`), how to change the colours, and `npm run screens`.
- [ ] **Step 5:** `npm test && npm run lint && npm run build && npm run test:e2e` → pass, output pristine. Commit `feat(ui): remove tailwind and shadcn; responsive and offline checks; screenshots`.
