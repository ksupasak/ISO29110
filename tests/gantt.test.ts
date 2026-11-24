import { describe, expect, it } from "vitest";
import { bangkokToday, buildGantt, type GanttMilestoneInput, type GanttTaskInput } from "@/features/plan/gantt";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = d("2026-11-24");

let seq = 0;
function task(over: Partial<GanttTaskInput> = {}): GanttTaskInput {
  seq += 1;
  return {
    id: `t${seq}`,
    code: `T-${String(seq).padStart(3, "0")}`,
    title: `งาน ${seq}`,
    depth: 0,
    status: "TODO",
    percent: 0,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    ...over,
  };
}

function milestone(over: Partial<GanttMilestoneInput> = {}): GanttMilestoneInput {
  return { id: "m1", code: "M1", name: "ส่งมอบ", plannedDate: null, revisedDate: null, actualDate: null, ...over };
}

const week = { scale: "week" as const, today: TODAY };
const month = { scale: "month" as const, today: TODAY };

describe("buildGantt", () => {
  it("returns null when no task and no milestone has a date", () => {
    expect(buildGantt([], [], week)).toBeNull();
    expect(buildGantt([task(), task({ percent: 50 })], [milestone()], week)).toBeNull();
  });

  it("one-day bar when only plannedStart is set", () => {
    const g = buildGantt([task({ plannedStart: d("2026-11-04") })], [], week)!;
    expect(g.rows[0].planned).toMatchObject({ width: 16 });
    const onlyEnd = buildGantt([task({ plannedEnd: d("2026-11-04") })], [], week)!;
    expect(onlyEnd.rows[0].planned).toEqual(g.rows[0].planned);
  });

  it("swaps reversed planned dates", () => {
    const g = buildGantt(
      [task({ plannedStart: d("2026-11-10"), plannedEnd: d("2026-11-04") }), task({ plannedStart: d("2026-11-04") })],
      [],
      week,
    )!;
    const bar = g.rows[0].planned!;
    expect(bar.width).toBeGreaterThan(0);
    expect(bar.width).toBe(7 * 16);
    expect(bar.x).toBe(g.rows[1].planned!.x);
  });

  it("inclusive end day", () => {
    const g = buildGantt([task({ plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06") })], [], week)!;
    expect(g.rows[0].planned).toEqual({ x: 0, width: 80 });
  });

  it("progressWidth is percent of the planned bar", () => {
    const g = buildGantt(
      [task({ plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06"), percent: 50 }), task({ percent: 50 })],
      [],
      week,
    )!;
    expect(g.rows[0].progressWidth).toBe(40);
    expect(g.rows[1].planned).toBeNull();
    expect(g.rows[1].progressWidth).toBe(0);
  });

  it("late is true for an open task whose planned end is before today, false when DONE", () => {
    const past = { plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06") };
    const g = buildGantt(
      [
        task({ ...past, status: "DOING" }),
        task({ ...past, status: "DONE", percent: 100 }),
        task({ plannedStart: d("2026-11-20"), plannedEnd: d("2026-11-24"), status: "TODO" }),
        task({ status: "TODO" }),
      ],
      [],
      week,
    )!;
    expect(g.rows.map((r) => r.late)).toEqual([true, false, false, false]);
  });

  it("actual bar runs to today when actualEnd is missing", () => {
    const g = buildGantt([task({ plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-30"), actualStart: d("2026-11-16") })], [], week)!;
    // range starts Mon 2026-11-02; 16..24 Nov inclusive = 9 days
    expect(g.rows[0].actual).toEqual({ x: 14 * 16, width: 9 * 16 });
    const done = buildGantt(
      [task({ plannedStart: d("2026-11-02"), actualStart: d("2026-11-03"), actualEnd: d("2026-11-04") })],
      [],
      week,
    )!;
    expect(done.rows[0].actual).toEqual({ x: 16, width: 32 });
    expect(buildGantt([task({ plannedStart: d("2026-11-02") })], [], week)!.rows[0].actual).toBeNull();
  });

  it("range starts on a Monday in week scale and on day 1 in month scale", () => {
    // 2026-11-11 is a Wednesday; 2026-12-03 is a Thursday
    const tasks = [task({ plannedStart: d("2026-11-11"), plannedEnd: d("2026-12-03") })];
    const w = buildGantt(tasks, [], week)!;
    // Monday 2026-11-09 .. Sunday 2026-12-06 = 28 days
    expect(w.rows[0].planned!.x).toBe(2 * 16);
    expect(w.width).toBe(28 * 16);
    expect(w.ticks[0]).toMatchObject({ x: 0, label: "09/11" });
    const m = buildGantt(tasks, [], month)!;
    // 2026-11-01 .. 2026-12-31 = 61 days at 4 px
    expect(m.rows[0].planned!.x).toBe(10 * 4);
    expect(m.width).toBe(61 * 4);
    expect(m.ticks.map((t) => t.x)).toEqual([0, 30 * 4]);
  });

  it("tick labels use the Buddhist year", () => {
    const tasks = [task({ plannedStart: d("2026-10-20"), plannedEnd: d("2027-01-10") })];
    const w = buildGantt(tasks, [], week)!;
    const nov = w.ticks.find((t) => t.major && t.label.startsWith("พ.ย."))!;
    expect(nov.label).toBe("พ.ย. 2569");
    expect(nov.x).toBe(14 * 16); // Mon 2026-10-19 -> Mon 2026-11-02
    expect(w.ticks.filter((t) => !t.major).every((t) => /^\d{2}\/\d{2}$/.test(t.label))).toBe(true);
    const m = buildGantt(tasks, [], month)!;
    expect(m.ticks.map((t) => [t.label, t.major])).toEqual([
      ["ต.ค. 2569", true],
      ["พ.ย.", false],
      ["ธ.ค.", false],
      ["ม.ค. 2570", true],
    ]);
  });

  it("todayX is null when today is more than 30 days outside the range", () => {
    const far = buildGantt([task({ plannedStart: d("2027-03-01"), plannedEnd: d("2027-03-05") })], [], week)!;
    expect(far.todayX).toBeNull();
    // 2026-12-14 is a Monday; today (2026-11-24) is 20 days before it, so the range widens to include today
    const near = buildGantt([task({ plannedStart: d("2026-12-14"), plannedEnd: d("2026-12-18") })], [], week)!;
    expect(near.todayX).not.toBeNull();
    expect(near.ticks[0].label).toBe("23/11");
    expect(near.todayX).toBe(16 + 8);
  });

  it("today joins the range at exactly 30 days outside it, not at 31", () => {
    // Monday 2026-12-07 .. Sunday 2026-12-13 is a whole week; 2026-11-07 is 30 days before, 2026-11-06 is 31
    const tasks = [task({ plannedStart: d("2026-12-07"), plannedEnd: d("2026-12-13") })];
    const at30 = buildGantt(tasks, [], { scale: "week", today: d("2026-11-07") })!;
    expect(at30.todayX).not.toBeNull();
    expect(at30.width).toBe(42 * 16); // Mon 2026-11-02 .. Sun 2026-12-13
    const at31 = buildGantt(tasks, [], { scale: "week", today: d("2026-11-06") })!;
    expect(at31.todayX).toBeNull();
    expect(at31.width).toBe(7 * 16);
    // and after the range: 2026-12-13 + 30 = 2027-01-12, + 31 = 2027-01-13
    expect(buildGantt(tasks, [], { scale: "week", today: d("2027-01-12") })!.todayX).not.toBeNull();
    expect(buildGantt(tasks, [], { scale: "week", today: d("2027-01-13") })!.todayX).toBeNull();
  });

  it("caps the range at 5 years from today when a date has a mistyped year", () => {
    const normal = [
      task({ id: "a", plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06"), percent: 50 }),
      task({ id: "b", plannedStart: d("2026-11-09"), plannedEnd: d("2026-12-04") }),
    ];
    const typo = task({ id: "bad", plannedStart: d("2569-11-02"), plannedEnd: d("2569-11-10") });
    const ms = [milestone({ id: "m-bad", plannedDate: d("2569-12-31") }), milestone({ id: "m-ok", code: "M2", plannedDate: d("2026-11-30") })];
    const clean = buildGantt(normal, [ms[1]], week)!;
    const g = buildGantt([...normal, typo], ms, week)!;
    expect(g.truncated).toBe(true);
    expect(g.width).toBeLessThan(5 * 16 * 366 * 2);
    expect(g.width).toBe(clean.width);
    expect(g.rows.find((r) => r.id === "bad")!.planned).toBeNull();
    expect(g.rows.find((r) => r.id === "bad")!.progressWidth).toBe(0);
    expect(g.rows.filter((r) => r.id !== "bad")).toEqual(clean.rows);
    expect(g.milestones.map((m) => m.id)).toEqual(["m-ok"]);
    expect(clean.truncated).toBe(false);
  });

  it("clips a bar that crosses the 5-year limit", () => {
    const g = buildGantt(
      [task({ plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-06") }), task({ plannedStart: d("2026-11-02"), plannedEnd: d("2569-01-01") })],
      [],
      week,
    )!;
    expect(g.truncated).toBe(true);
    const bar = g.rows[1].planned!;
    expect(bar.x).toBe(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(g.width);
  });

  it("does not truncate a normal two-year plan", () => {
    const g = buildGantt([task({ plannedStart: d("2026-01-05"), plannedEnd: d("2027-12-31") })], [], month)!;
    expect(g.truncated).toBe(false);
    expect(g.rows[0].planned!.width).toBe((361 + 365) * 4); // 05/01/2026..31/12/2027 inclusive
  });

  it("the cap applies to the span, not to a short plan far from today", () => {
    const g = buildGantt([task({ plannedStart: d("2569-11-02") })], [], week)!;
    expect(g.truncated).toBe(false);
    expect(g.rows[0].planned).toMatchObject({ width: 16 });
    expect(g.todayX).toBeNull();
  });

  it("milestone marker uses actual, then revised, then planned date", () => {
    const tasks = [task({ plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-29") })];
    const g = buildGantt(
      tasks,
      [
        milestone({ id: "a", code: "M1", plannedDate: d("2026-11-03"), revisedDate: d("2026-11-04"), actualDate: d("2026-11-05") }),
        milestone({ id: "b", code: "M2", plannedDate: d("2026-11-03"), revisedDate: d("2026-11-04") }),
        milestone({ id: "c", code: "M3", plannedDate: d("2026-11-03") }),
        milestone({ id: "d", code: "M4" }),
      ],
      week,
    )!;
    expect(g.milestones.map((m) => [m.code, m.x])).toEqual([
      ["M1", 3 * 16 + 8],
      ["M2", 2 * 16 + 8],
      ["M3", 1 * 16 + 8],
    ]);
  });
});

describe("bangkokToday", () => {
  it("returns the Bangkok calendar day at UTC midnight", () => {
    expect(bangkokToday(new Date("2026-11-24T18:30:00Z"))).toEqual(new Date("2026-11-25T00:00:00Z"));
    expect(bangkokToday(new Date("2026-11-24T16:59:59Z"))).toEqual(new Date("2026-11-24T00:00:00Z"));
  });
});
