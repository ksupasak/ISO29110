# Plan Gantt View — Design and Implementation Plan

**Goal:** The plan page of a project can show its Tasks as a read-only Gantt chart.

**Why:** A PM wants to see the schedule at a glance (overlaps, late work, where the milestones fall) without reading date columns.

**Approaches considered**

1. Hand-drawn SVG rendered on the server, no new dependency — **chosen**. Read-only display is small, fits the theme, and Buddhist-era labels are under our control.
2. A Gantt library (frappe-gantt, gantt-task-react) — rejected: styling fights the Bootstrap theme, no Buddhist calendar, extra client bundle for a view that needs no interaction.
3. CSS grid of day cells — rejected: a year-long project means hundreds of columns per row.

**Non-goals (approved by the user):** dragging bars to change dates, dependency links between tasks, export of the chart as an image.

## Global Constraints

- Next.js 16.4.6: read the relevant guide in `node_modules/next/dist/docs/` before writing code; `params`/`searchParams` are Promises.
- No new npm dependency. No schema change, no migration.
- All UI text in Thai. Years shown in Buddhist era (พ.ศ.).
- Dates are `@db.Date` values (UTC midnight). All day arithmetic in UTC; "today" is the current date in `Asia/Bangkok`.
- Pure layout logic lives in `src/features/plan/gantt.ts` (no `next/*`, no React, no Prisma) and is unit tested. The page stays a server component; the chart needs no client JavaScript.
- Colours come from the project Sass theme / Bootstrap CSS variables (`var(--bs-primary)`, `var(--bs-danger)` …), never hard-coded hex, so the chart follows the theme.
- Existing table view, filters and dialogs keep working unchanged; default view stays the table.
- Commit trailer: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. No task has any planned date → no time axis can be computed: show the empty-state text, not a broken SVG.
2. A task with only one of plannedStart/plannedEnd → draw a one-day bar at that date.
3. plannedEnd before plannedStart (old data) → swap, never a negative width.
4. A very long range (2+ years) in week scale → the chart scrolls horizontally inside its card; the page itself does not scroll sideways; the task-name column stays visible.
5. Filters + view: switching view keeps the filters, filtering keeps the view and scale.

## Task 1: Gantt view on the plan page

**Files**
- Create: `src/features/plan/gantt.ts`, `tests/gantt.test.ts`
- Create: `src/app/(app)/projects/[code]/plan/gantt-chart.tsx` (server component, SVG)
- Modify: `src/features/plan/service.ts` (`TaskRow` gains `actualStart: Date | null`, `actualEnd: Date | null`; `toRow` fills them)
- Modify: `src/app/(app)/projects/[code]/plan/page.tsx`
- Modify: the project Sass file that holds component styles (add `.gantt` rules)
- Modify: `e2e/release2a.spec.ts` or new `e2e/gantt.spec.ts`
- Modify: `README.md` (one line under the plan feature)

**Interfaces — `src/features/plan/gantt.ts`**

```ts
export type GanttScale = "week" | "month";
export type GanttTaskInput = Pick<TaskRow,
  "id" | "code" | "title" | "depth" | "status" | "percent" |
  "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd">;
export type GanttMilestoneInput = Pick<MilestoneView, "id" | "code" | "name" | "plannedDate" | "revisedDate" | "actualDate">;

export type GanttBar = { x: number; width: number };          // px from chart left
export type GanttRow = {
  id: string; code: string; title: string; depth: number;
  planned: GanttBar | null;        // null when the task has no planned date
  progressWidth: number;           // planned.width * percent / 100, 0 when no bar
  actual: GanttBar | null;         // actualStart..(actualEnd ?? today); null when no actualStart
  late: boolean;                   // status != DONE and planned end < today
};
export type GanttTick = { x: number; label: string; major: boolean };
export type GanttMarker = { id: string; code: string; name: string; x: number };
export type GanttModel = {
  width: number;                   // px of the time area
  ticks: GanttTick[];
  rows: GanttRow[];
  milestones: GanttMarker[];
  todayX: number | null;           // null when today is outside the range
} | null;                          // null when nothing has a date

export function buildGantt(
  tasks: GanttTaskInput[], milestones: GanttMilestoneInput[],
  opts: { scale: GanttScale; today: Date },
): GanttModel;
export function bangkokToday(now?: Date): Date;   // UTC-midnight Date of the Bangkok calendar day
```

Rules:
- Day width: week scale 16 px/day, month scale 4 px/day.
- Range: earliest to latest of all task planned/actual dates and milestone dates (milestone date = actual ?? revised ?? planned), widened to whole weeks (Monday start) in week scale or whole months in month scale, plus `today` only if it lies within 30 days of that range.
- A bar covers its end day inclusively: `width = (endDay - startDay + 1) * dayWidth`.
- Ticks: week scale → one tick per Monday labelled `dd/mm`, `major` on the first Monday of each month with label `MMM พ.ศ.` (Thai short month, e.g. `พ.ย. 2569`); month scale → one tick per month labelled Thai short month, `major` on January and on the first tick with the Buddhist year.
- Milestones without any date are omitted.

**Tests — `tests/gantt.test.ts`** (pure, no DB)
- `returns null when no task and no milestone has a date`
- `one-day bar when only plannedStart is set` → width 16 in week scale
- `swaps reversed planned dates` → width > 0, x at the earlier date
- `inclusive end day`: 2026-11-02..2026-11-06 in week scale → width 80
- `progressWidth is percent of the planned bar` (50% of 80 → 40)
- `late is true for an open task whose planned end is before today, false when DONE`
- `actual bar runs to today when actualEnd is missing`
- `range starts on a Monday in week scale and on day 1 in month scale`
- `tick labels use the Buddhist year` (a tick in Nov 2026 contains `2569`)
- `todayX is null when today is more than 30 days outside the range`
- `milestone marker uses actual, then revised, then planned date`
- `bangkokToday`: `2026-11-24T18:30:00Z` → `2026-11-25T00:00:00Z`

**Page**
- Query params: `view=gantt` (anything else = table), `scale=week|month` (default `week`). The filter form carries `view` and `scale` as hidden inputs; the view switch and scale switch are link button groups that keep the current filters. "ล้างตัวกรอง" keeps the view.
- In the Task card header area: button group `ตาราง` / `Gantt`; when Gantt is active a second group `สัปดาห์` / `เดือน`.
- Gantt view replaces the task table only (Milestone card and dialogs unchanged). Rows are the same filtered, WBS-sorted `tasks`.
- Layout: a fixed left column (task code linking to `${base}/plan/${code}`, title indented by depth, truncated with `title` attribute) and a horizontally scrollable time area (`overflow-x: auto`) holding one `<svg>`; row height 32 px, header 40 px.
- SVG contents: tick grid lines and labels; per row a planned bar (class `gantt-bar`, `gantt-bar-late` when late), a progress fill inside it, a thin actual bar under it; a vertical "วันนี้" line; milestone diamonds on the header with a dashed line down and `<title>` = code + name. Each bar has a `<title>` with code, title, Thai dates and percent.
- Accessibility: `role="img"` and `aria-label="Gantt chart ของแผนงาน"` on the svg; the left column is real HTML links, so every task stays reachable by keyboard.
- Empty states: no tasks → existing texts; tasks but `buildGantt` returns null → `ยังไม่มี Task ที่กำหนดวันตามแผน`. A legend line under the chart explains the colours (ตามแผน, ความคืบหน้า, วันจริง, เลยกำหนด, Milestone).

**e2e:** log in as the seeded PM, open a project plan that has tasks with dates, click `Gantt` → the svg with the aria-label is visible, the number of `.gantt-bar` elements equals the number of dated tasks shown, clicking `เดือน` keeps the chart and changes the URL to `scale=month`, a task-code link in the left column opens the task page. Check the page has no horizontal scroll at 375 px width (`document.documentElement.scrollWidth <= clientWidth`).

**Verification:** `npm test`, `npm run lint`, `npx tsc --noEmit`, `NEXT_DIST_DIR=.next-e2e npm run build`, `npm run test:e2e`.

**Commit:** `feat(plan): read-only Gantt view of tasks`
