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
