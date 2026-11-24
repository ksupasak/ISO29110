import { beforeEach, describe, expect, test } from "vitest";
import type { ProjectRole, SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createProject } from "@/features/projects/service";
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  getTask,
  listMyOpenTasks,
  listPlan,
  updateMilestone,
  updateTask,
  updateTaskProgress,
} from "@/features/plan/service";

const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

let n = 0;
const mkUser = (systemRole: SystemRole = "USER") => {
  n += 1;
  return prisma.user.create({ data: { username: `p${n}`, passwordHash: "x", fullName: `User ${n}`, systemRole } });
};
async function join(projectId: string, user: User, roles: ProjectRole[]) {
  await prisma.projectMember.create({ data: { projectId, userId: user.id, roles, primaryRole: roles[0] } });
}

let admin: User, pm: User, dev: User, analyst: User, viewer: User, outsider: User, pmB: User;
let pid: string, pidB: string;

async function task(user: User, projectId: string, extra: Record<string, unknown> = {}) {
  const r = await createTask(user, projectId, { title: "งาน", ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  pm = await mkUser();
  pmB = await mkUser();
  dev = await mkUser();
  analyst = await mkUser();
  viewer = await mkUser();
  outsider = await mkUser();
  const a = await createProject(admin, { code: "PLAN-A", name: "A", pmUserId: pm.id });
  const b = await createProject(admin, { code: "PLAN-B", name: "B", pmUserId: pmB.id });
  if (!a.ok || !b.ok) throw new Error("setup");
  pid = a.data.id;
  pidB = b.data.id;
  await join(pid, dev, ["PR"]);
  await join(pid, analyst, ["AN"]);
  await join(pid, viewer, ["VIEWER"]);
});

describe("milestones", () => {
  test("codes M1, M2; plannedDate is required", async () => {
    const m1 = await createMilestone(pm, pid, { name: "ส่งมอบ 1", plannedDate: d("2026-12-01") });
    const m2 = await createMilestone(pm, pid, { name: "ส่งมอบ 2", plannedDate: d("2027-01-01") });
    expect(m1.ok && m1.data.code).toBe("M1");
    expect(m2.ok && m2.data.code).toBe("M2");
    expect(await createMilestone(pm, pid, { name: "x" } as never)).toEqual({ ok: false, error: "กรุณาระบุวันตามแผน" });
    expect(await createMilestone(pm, pid, { name: "x", plannedDate: null } as never)).toEqual({ ok: false, error: "กรุณาระบุวันตามแผน" });
    if (!m1.ok) throw new Error();
    expect(await updateMilestone(pm, m1.data.id, { name: "x", plannedDate: null } as never)).toEqual({ ok: false, error: "กรุณาระบุวันตามแผน" });
    expect(await updateMilestone(pm, m1.data.id, { name: "ใหม่", plannedDate: d("2026-12-05"), revisedDate: d("2026-12-09") })).toMatchObject({ ok: true });
    const row = await prisma.milestone.findUniqueOrThrow({ where: { id: m1.data.id } });
    expect(row.name).toBe("ใหม่");
    expect(row.revisedDate).toEqual(d("2026-12-09"));
  });

  test("only PM manages; other project's PM is refused", async () => {
    const input = { name: "x", plannedDate: d("2026-12-01") };
    for (const u of [analyst, dev, viewer, outsider]) expect(await createMilestone(u, pid, input)).toEqual(denied);
    expect(await createMilestone(pmB, pid, input)).toEqual(denied);
    const m = await createMilestone(pm, pid, input);
    if (!m.ok) throw new Error();
    expect(await updateMilestone(pmB, m.data.id, input)).toEqual(denied);
    expect(await deleteMilestone(pmB, m.data.id)).toEqual(denied);
    expect(await createMilestone(admin, pid, input)).toMatchObject({ ok: true });
  });

  test("delete is blocked while tasks use it, naming them; free milestone deletes", async () => {
    const m = await createMilestone(pm, pid, { name: "x", plannedDate: d("2026-12-01") });
    if (!m.ok) throw new Error();
    await task(pm, pid, { milestoneId: m.data.id });
    await task(pm, pid, { milestoneId: m.data.id });
    expect(await deleteMilestone(pm, m.data.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก T-001, T-002" });
    await prisma.task.deleteMany({ where: { projectId: pid } });
    expect(await deleteMilestone(pm, m.data.id)).toMatchObject({ ok: true });
  });

  test("a task cannot point at a milestone of another project", async () => {
    const mb = await createMilestone(pmB, pidB, { name: "b", plannedDate: d("2026-12-01") });
    if (!mb.ok) throw new Error();
    expect(await createTask(pm, pid, { title: "t", milestoneId: mb.data.id })).toEqual({ ok: false, error: "ไม่พบ Milestone ในโครงการนี้" });
    const t = await task(pm, pid);
    expect(await updateTask(pm, t.id, { title: "t", milestoneId: mb.data.id })).toEqual({ ok: false, error: "ไม่พบ Milestone ในโครงการนี้" });
  });
});

describe("createTask / updateTask", () => {
  test("codes T-001..., defaults, only PM", async () => {
    const t1 = await task(pm, pid);
    const t2 = await task(pm, pid);
    expect([t1.code, t2.code]).toEqual(["T-001", "T-002"]);
    expect(t1).toMatchObject({ status: "TODO", percent: 0, kind: "DEV" });
    for (const u of [analyst, dev, viewer, outsider, pmB]) {
      expect(await createTask(u, pid, { title: "x" })).toEqual(denied);
    }
  });

  test("two concurrent creates get different codes", async () => {
    const rs = await Promise.all(Array.from({ length: 8 }, () => createTask(pm, pid, { title: "x" })));
    const codes = rs.map((r) => (r.ok ? r.data.code : "ERR"));
    expect(new Set(codes).size).toBe(8);
  });

  test("assignee must be a member of the project", async () => {
    expect(await createTask(pm, pid, { title: "x", assigneeId: outsider.id })).toEqual({ ok: false, error: "ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ" });
    expect(await createTask(pm, pid, { title: "x", assigneeId: dev.id })).toMatchObject({ ok: true });
  });

  test("validation: title, percent, days, date order", async () => {
    expect(await createTask(pm, pid, { title: "  " })).toEqual({ ok: false, error: "กรุณากรอกชื่องาน" });
    for (const percent of [-1, 101, 50.5]) {
      expect(await createTask(pm, pid, { title: "x", percent })).toEqual({ ok: false, error: "ความคืบหน้า (%) ต้องเป็นจำนวนเต็ม 0-100" });
    }
    for (const plannedDays of [1.3, -0.5]) {
      expect(await createTask(pm, pid, { title: "x", plannedDays })).toEqual({ ok: false, error: "จำนวนวันต้องไม่ติดลบและเป็นทวีคูณของ 0.5" });
    }
    expect(await createTask(pm, pid, { title: "x", plannedDays: 1.5, actualDays: 2 })).toMatchObject({ ok: true });
    expect(
      await createTask(pm, pid, { title: "x", plannedStart: d("2026-12-10"), plannedEnd: d("2026-12-09") }),
    ).toEqual({ ok: false, error: "วันสิ้นสุดตามแผนต้องไม่ก่อนวันเริ่ม" });
    expect(
      await createTask(pm, pid, { title: "x", actualStart: d("2026-12-10"), actualEnd: d("2026-12-09") }),
    ).toEqual({ ok: false, error: "วันสิ้นสุดจริงต้องไม่ก่อนวันเริ่ม" });
  });

  test("status DONE forces percent 100", async () => {
    const t = await createTask(pm, pid, { title: "x", status: "DONE", percent: 20 });
    expect(t.ok && t.data.percent).toBe(100);
    const t2 = await task(pm, pid);
    const u = await updateTask(pm, t2.id, { title: "x", status: "DONE" });
    expect(u.ok && u.data.percent).toBe(100);
  });

  test("parent must be in the same project", async () => {
    const other = await task(pmB, pidB);
    expect(await createTask(pm, pid, { title: "x", parentId: other.id })).toEqual({ ok: false, error: "ไม่พบ Task แม่ในโครงการนี้" });
    const t = await task(pm, pid);
    expect(await updateTask(pm, t.id, { title: "x", parentId: other.id })).toEqual({ ok: false, error: "ไม่พบ Task แม่ในโครงการนี้" });
  });

  test("parent cycles are rejected", async () => {
    const a = await task(pm, pid);
    const b = await task(pm, pid, { parentId: a.id });
    const c = await task(pm, pid, { parentId: b.id });
    expect(await updateTask(pm, a.id, { title: "x", parentId: a.id })).toEqual({ ok: false, error: "Task แม่ต้องไม่เป็นตัวเองหรือเป็นลูกหลานของตัวเอง" });
    expect(await updateTask(pm, a.id, { title: "x", parentId: b.id })).toEqual({ ok: false, error: "Task แม่ต้องไม่เป็นตัวเองหรือเป็นลูกหลานของตัวเอง" });
    expect(await updateTask(pm, a.id, { title: "x", parentId: c.id })).toEqual({ ok: false, error: "Task แม่ต้องไม่เป็นตัวเองหรือเป็นลูกหลานของตัวเอง" });
    expect(await updateTask(pm, c.id, { title: "x", parentId: a.id })).toMatchObject({ ok: true });
  });

  test("update replaces planning fields but keeps progress when not sent", async () => {
    const t = await task(pm, pid, { title: "เดิม", note: "n", assigneeId: dev.id });
    await updateTaskProgress(dev, t.id, { status: "DOING", percent: 40 });
    const u = await updateTask(pm, t.id, { title: "ใหม่" });
    expect(u.ok && u.data).toMatchObject({ title: "ใหม่", note: null, assigneeId: null, status: "DOING", percent: 40 });
  });

  test("cross-project ids are refused", async () => {
    const tb = await task(pmB, pidB);
    expect(await updateTask(pm, tb.id, { title: "x" })).toEqual(denied);
    expect(await updateTaskProgress(pm, tb.id, { status: "DONE" })).toEqual(denied);
    expect(await deleteTask(pm, tb.id)).toEqual(denied);
    expect(await createTask(pm, pidB, { title: "x" })).toEqual(denied);
  });
});

describe("updateTaskProgress", () => {
  test("assignee changes progress fields only", async () => {
    const t = await task(pm, pid, { title: "เดิม", assigneeId: dev.id });
    const r = await updateTaskProgress(dev, t.id, {
      status: "DOING",
      percent: 30,
      actualStart: d("2026-12-01"),
      actualDays: 1.5,
      title: "แก้ชื่อ",
      assigneeId: analyst.id,
    } as never);
    expect(r).toMatchObject({ ok: true });
    const row = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ title: "เดิม", assigneeId: dev.id, status: "DOING", percent: 30 });
    expect(row.actualStart).toEqual(d("2026-12-01"));
    expect(Number(row.actualDays)).toBe(1.5);
    expect(await updateTask(dev, t.id, { title: "x" })).toEqual(denied);
    expect(await deleteTask(dev, t.id)).toEqual(denied);
  });

  test("PM may use it too; others, non-assignees, viewer-only assignee and outsiders may not", async () => {
    const t = await task(pm, pid, { assigneeId: dev.id });
    expect(await updateTaskProgress(pm, t.id, { status: "DOING" })).toMatchObject({ ok: true });
    for (const u of [analyst, viewer, outsider]) {
      expect(await updateTaskProgress(u, t.id, { status: "DONE" })).toEqual(denied);
    }
    const tv = await task(pm, pid, { assigneeId: viewer.id });
    expect(await updateTaskProgress(viewer, tv.id, { status: "DONE" })).toEqual(denied);
  });

  test("DONE forces 100, validation and merged date order apply", async () => {
    const t = await task(pm, pid, { assigneeId: dev.id, actualStart: d("2026-12-10") });
    const r = await updateTaskProgress(dev, t.id, { status: "DONE", percent: 10 });
    expect(r.ok && r.data.percent).toBe(100);
    expect(await updateTaskProgress(dev, t.id, { percent: 101 })).toEqual({ ok: false, error: "ความคืบหน้า (%) ต้องเป็นจำนวนเต็ม 0-100" });
    expect(await updateTaskProgress(dev, t.id, { actualDays: 0.3 })).toEqual({ ok: false, error: "จำนวนวันต้องไม่ติดลบและเป็นทวีคูณของ 0.5" });
    // actualEnd before the stored actualStart
    expect(await updateTaskProgress(dev, t.id, { actualEnd: d("2026-12-09") })).toEqual({ ok: false, error: "วันสิ้นสุดจริงต้องไม่ก่อนวันเริ่ม" });
  });
});

describe("deleteTask", () => {
  test("blocked while it has children, naming them", async () => {
    const a = await task(pm, pid);
    await task(pm, pid, { parentId: a.id });
    await task(pm, pid, { parentId: a.id });
    expect(await deleteTask(pm, a.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก T-002, T-003" });
    await prisma.task.deleteMany({ where: { parentId: a.id } });
    expect(await deleteTask(pm, a.id)).toMatchObject({ ok: true });
  });

  test("blocked while meeting items link to it, naming the meetings", async () => {
    const a = await task(pm, pid);
    const mk = (code: string) =>
      prisma.meeting.create({ data: { projectId: pid, code, topic: "t", meetingDate: d("2026-12-01") } });
    const m1 = await mk("MR-2569-02");
    const m2 = await mk("MR-2569-01");
    for (const m of [m1, m1, m2]) {
      await prisma.meetingItem.create({
        data: { meetingId: m.id, projectId: pid, kind: "OPEN_ISSUE", order: 1, text: "x", taskId: a.id },
      });
    }
    expect(await deleteTask(pm, a.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก MR-2569-01, MR-2569-02" });
    await prisma.meetingItem.updateMany({ where: { taskId: a.id }, data: { taskId: null } });
    expect(await deleteTask(pm, a.id)).toMatchObject({ ok: true });
  });

  test("a deleted code is not reused", async () => {
    const a = await task(pm, pid);
    await deleteTask(pm, a.id);
    expect((await task(pm, pid)).code).toBe("T-002");
  });
});

describe("listPlan", () => {
  test("WBS order with numeric segments, unnumbered last by code; depth from parents", async () => {
    const t1 = await task(pm, pid, { wbsCode: "2.10" }); // T-001
    const t2 = await task(pm, pid, { wbsCode: "2.9" }); // T-002
    const t3 = await task(pm, pid); // T-003 no wbs
    const t4 = await task(pm, pid, { wbsCode: "2", parentId: null }); // T-004
    const t5 = await task(pm, pid, { wbsCode: "1" }); // T-005
    await updateTask(pm, t1.id, { title: "x", wbsCode: "2.10", parentId: t4.id });
    await updateTask(pm, t2.id, { title: "x", wbsCode: "2.9", parentId: t4.id });
    await updateTask(pm, t3.id, { title: "x", parentId: t2.id });
    const { tasks } = await listPlan(pm, pid);
    expect(tasks.map((t) => t.code)).toEqual(["T-005", "T-004", "T-002", "T-001", "T-003"]);
    expect(tasks.map((t) => t.depth)).toEqual([0, 0, 1, 1, 2]);
    expect(t5.code).toBe("T-005");
  });

  test("filters by status, assignee and kind; milestones listed", async () => {
    await createMilestone(pm, pid, { name: "m", plannedDate: d("2026-12-01") });
    const a = await task(pm, pid, { assigneeId: dev.id, kind: "FIX" });
    await updateTaskProgress(dev, a.id, { status: "DOING" });
    await task(pm, pid, { assigneeId: analyst.id });
    const res = await listPlan(pm, pid);
    expect(res.milestones.map((m) => m.code)).toEqual(["M1"]);
    expect(res.tasks).toHaveLength(2);
    expect((await listPlan(pm, pid, { status: "DOING" })).tasks.map((t) => t.code)).toEqual(["T-001"]);
    expect((await listPlan(pm, pid, { assigneeId: analyst.id })).tasks.map((t) => t.code)).toEqual(["T-002"]);
    expect((await listPlan(pm, pid, { kind: "FIX" })).tasks.map((t) => t.code)).toEqual(["T-001"]);
    expect((await listPlan(pm, pid, { kind: "FIX" })).tasks[0]).toMatchObject({ assigneeName: dev.fullName });
  });

  test("members can read; non-members and other projects' PMs get nothing", async () => {
    await task(pm, pid);
    expect((await listPlan(viewer, pid)).tasks).toHaveLength(1);
    expect(await listPlan(outsider, pid)).toEqual({ milestones: [], tasks: [] });
    expect(await listPlan(pmB, pid)).toEqual({ milestones: [], tasks: [] });
  });
});

describe("getTask", () => {
  test("returns detail for members, null otherwise", async () => {
    const parent = await task(pm, pid);
    await task(pm, pid, { parentId: parent.id, title: "ลูก" });
    const d1 = await getTask(viewer, pid, "T-001");
    expect(d1).toMatchObject({ code: "T-001", children: [{ code: "T-002", title: "ลูก" }], requirements: [], components: [] });
    expect((await getTask(viewer, pid, "T-002"))?.parent).toMatchObject({ code: "T-001" });
    expect(await getTask(viewer, pid, "T-999")).toBeNull();
    expect(await getTask(outsider, pid, "T-001")).toBeNull();
    expect(await getTask(pmB, pid, "T-001")).toBeNull();
  });
});

describe("listMyOpenTasks", () => {
  test("own, not DONE, in visible projects", async () => {
    const a = await task(pm, pid, { assigneeId: dev.id, title: "เปิด" });
    const b = await task(pm, pid, { assigneeId: dev.id });
    await task(pm, pid, { assigneeId: analyst.id });
    await updateTaskProgress(dev, b.id, { status: "DONE" });
    const mine = await listMyOpenTasks(dev);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ taskCode: a.code, projectCode: "PLAN-A", title: "เปิด", status: "TODO" });
    // removed from the project -> no longer visible
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: pid, userId: dev.id } } });
    expect(await listMyOpenTasks(dev)).toEqual([]);
    expect(await listMyOpenTasks(outsider)).toEqual([]);
  });
});

describe("selectableParents", () => {
  test("excludes the task and all its descendants", async () => {
    const { selectableParents } = await import("@/app/(app)/projects/[code]/plan/form-values");
    const tasks = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: null },
    ];
    expect(selectableParents(tasks, "a").map((t) => t.id)).toEqual(["d"]);
    expect(selectableParents(tasks, "b").map((t) => t.id)).toEqual(["a", "d"]);
    expect(selectableParents(tasks, "c").map((t) => t.id)).toEqual(["a", "b", "d"]);
  });
});
