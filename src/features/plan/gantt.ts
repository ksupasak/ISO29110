// Pure layout for the read-only Gantt view of a project plan: no React, no Next.js, no database.
// Dates are `@db.Date` values (UTC midnight), so all day arithmetic is done in UTC day numbers.
import type { MilestoneView, TaskRow } from "./service";

export type GanttScale = "week" | "month";
export type GanttTaskInput = Pick<
  TaskRow,
  "id" | "code" | "title" | "depth" | "status" | "percent" | "plannedStart" | "plannedEnd" | "actualStart" | "actualEnd"
>;
export type GanttMilestoneInput = Pick<MilestoneView, "id" | "code" | "name" | "plannedDate" | "revisedDate" | "actualDate">;

/** Pixels from the left edge of the time area. */
export type GanttBar = { x: number; width: number };
export type GanttRow = {
  id: string;
  code: string;
  title: string;
  depth: number;
  /** Clipped to the chart; null when the task has no planned date or it lies wholly outside the (capped) range. */
  planned: GanttBar | null;
  /** planned.width * percent / 100; 0 when there is no planned bar. */
  progressWidth: number;
  /** actualStart..(actualEnd ?? today), clipped to the chart; null when there is no actualStart or it is wholly outside. */
  actual: GanttBar | null;
  /** status is not DONE and the planned end is before today. */
  late: boolean;
};
export type GanttTick = { x: number; label: string; major: boolean };
export type GanttMarker = { id: string; code: string; name: string; x: number };
export type GanttModel = {
  /** Pixel width of the time area. */
  width: number;
  ticks: GanttTick[];
  rows: GanttRow[];
  milestones: GanttMarker[];
  /** Centre of today's column; null when today is outside the range. */
  todayX: number | null;
  /** Some dates lay more than 5 years from today (usually a mistyped year) and were left out of the range. */
  truncated: boolean;
} | null;

const DAY_MS = 86_400_000;
const DAY_WIDTH: Record<GanttScale, number> = { week: 16, month: 4 };
/** Today joins the range only when it lies this close to it. */
const TODAY_REACH_DAYS = 30;
/** A range longer than this is capped to today ± this many years, so a mistyped year cannot make the chart huge. */
const MAX_YEARS = 5;
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const dayOf = (d: Date) => Math.floor(d.getTime() / DAY_MS);
const dateOf = (day: number) => new Date(day * DAY_MS);
const pad2 = (n: number) => String(n).padStart(2, "0");
const monthLabel = (d: Date, withYear: boolean) =>
  withYear ? `${THAI_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}` : THAI_MONTHS[d.getUTCMonth()];

/** [start, end] in day numbers from one or two optional dates: a single date is a one-day span, reversed dates are swapped. */
function span(a: Date | null, b: Date | null): [number, number] | null {
  const s = a ?? b;
  const e = b ?? a;
  if (!s || !e) return null;
  const x = dayOf(s);
  const y = dayOf(e);
  return x <= y ? [x, y] : [y, x];
}

const milestoneDate = (m: GanttMilestoneInput) => m.actualDate ?? m.revisedDate ?? m.plannedDate;

/** Day number of the same calendar day `years` later (Feb 29 rolls to Mar 1). */
function addYears(day: number, years: number): number {
  const d = dateOf(day);
  return dayOf(new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate())));
}

/** UTC-midnight Date of the current calendar day in Asia/Bangkok. */
export function bangkokToday(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

export function buildGantt(
  tasks: GanttTaskInput[],
  milestones: GanttMilestoneInput[],
  opts: { scale: GanttScale; today: Date },
): GanttModel {
  const dayWidth = DAY_WIDTH[opts.scale];
  const today = dayOf(opts.today);

  const days: number[] = [];
  for (const t of tasks) {
    for (const d of [t.plannedStart, t.plannedEnd, t.actualStart, t.actualEnd]) if (d) days.push(dayOf(d));
  }
  for (const m of milestones) {
    const d = milestoneDate(m);
    if (d) days.push(dayOf(d));
  }
  if (days.length === 0) return null;

  let min = Math.min(...days);
  let max = Math.max(...days);
  let truncated = false;
  if (max > addYears(min, MAX_YEARS)) {
    const lo = addYears(today, -MAX_YEARS);
    const hi = addYears(today, MAX_YEARS);
    const kept = days.filter((day) => day >= lo && day <= hi);
    truncated = true;
    // Nothing usable left: centre an empty chart on today.
    min = kept.length ? Math.min(...kept) : today;
    max = kept.length ? Math.max(...kept) : today;
  }
  if (today >= min - TODAY_REACH_DAYS && today <= max + TODAY_REACH_DAYS) {
    min = Math.min(min, today);
    max = Math.max(max, today);
  }
  if (opts.scale === "week") {
    // getUTCDay: 0 = Sunday; widen to Monday..Sunday
    min -= (dateOf(min).getUTCDay() + 6) % 7;
    max += (7 - dateOf(max).getUTCDay()) % 7;
  } else {
    const a = dateOf(min);
    const b = dateOf(max);
    min = dayOf(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)));
    max = dayOf(new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)));
  }

  const x = (day: number) => (day - min) * dayWidth;
  /** Bar for [s, e] clipped to the range; null when it lies wholly outside. */
  const bar = (s: number, e: number): GanttBar | null => {
    const cs = Math.max(s, min);
    const ce = Math.min(e, max);
    return cs <= ce ? { x: x(cs), width: (ce - cs + 1) * dayWidth } : null;
  };
  const centre = (day: number) => x(day) + dayWidth / 2;

  const ticks: GanttTick[] = [];
  if (opts.scale === "week") {
    for (let day = min; day <= max; day += 7) {
      const d = dateOf(day);
      const major = d.getUTCDate() <= 7; // first Monday of the month
      ticks.push({ x: x(day), label: major ? monthLabel(d, true) : `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`, major });
    }
  } else {
    const first = dateOf(min);
    for (let i = 0; ; i += 1) {
      const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
      const day = dayOf(d);
      if (day > max) break;
      const major = i === 0 || d.getUTCMonth() === 0;
      ticks.push({ x: x(day), label: monthLabel(d, major), major });
    }
  }

  const rows: GanttRow[] = tasks.map((t) => {
    const p = span(t.plannedStart, t.plannedEnd);
    const planned = p ? bar(p[0], p[1]) : null;
    const percent = Math.min(100, Math.max(0, t.percent));
    const a = t.actualStart ? span(t.actualStart, t.actualEnd ?? opts.today) : null;
    const actual = a ? bar(a[0], a[1]) : null;
    return {
      id: t.id,
      code: t.code,
      title: t.title,
      depth: t.depth,
      planned,
      progressWidth: planned ? (planned.width * percent) / 100 : 0,
      actual,
      late: !!p && t.status !== "DONE" && p[1] < today,
    };
  });

  const markers: GanttMarker[] = [];
  for (const m of milestones) {
    const d = milestoneDate(m);
    if (d && dayOf(d) >= min && dayOf(d) <= max) markers.push({ id: m.id, code: m.code, name: m.name, x: centre(dayOf(d)) });
  }

  return {
    width: (max - min + 1) * dayWidth,
    ticks,
    rows,
    milestones: markers,
    todayX: today >= min && today <= max ? centre(today) : null,
    truncated,
  };
}
