import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Meeting, Prisma, ProjectRole, SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { countStoredFiles, resetDb } from "./setup/db";
import { createProject } from "@/features/projects/service";
import { createTask } from "@/features/plan/service";
import { addAttachment } from "@/features/documents/service";
import { openFile } from "@/lib/storage";
import { ownerOptionsFor } from "@/app/(app)/projects/[code]/meetings/form-values";

/** Lets a test run something at the moment the service opens a stored file (to stage a race deterministically). */
const storageHooks = vi.hoisted(() => ({ beforeOpen: null as null | ((storedPath: string) => Promise<void>) }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...real,
    openFile: async (storedPath: string) => {
      const hook = storageHooks.beforeOpen;
      storageHooks.beforeOpen = null;
      if (hook) await hook(storedPath);
      return real.openFile(storedPath);
    },
  };
});
import {
  addAttendee,
  addItem,
  approveMeeting,
  createMeeting,
  createTaskFromIssue,
  deleteMeeting,
  effectiveIssueStatus,
  exportMeeting,
  getMeeting,
  linkIssueToTask,
  listIssuesForTask,
  listMeetings,
  lockDraftMeeting,
  MEETING_ENTITY,
  removeAttendee,
  removeItem,
  revertMeeting,
  updateAttendee,
  updateItem,
  updateMeeting,
} from "@/features/meetings/service";

const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
const locked = { ok: false, error: "การประชุมที่อนุมัติแล้วแก้ไม่ได้" };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

let n = 0;
const mkUser = (systemRole: SystemRole = "USER", position: string | null = null) => {
  n += 1;
  return prisma.user.create({
    data: { username: `mt${n}`, passwordHash: "x", fullName: `Meeting User ${n}`, position, systemRole },
  });
};
async function join(projectId: string, user: User, roles: ProjectRole[]) {
  await prisma.projectMember.create({ data: { projectId, userId: user.id, roles, primaryRole: roles[0] } });
}

let admin: User, pm: User, pmB: User, analyst: User, tl: User, dev: User, viewer: User, outsider: User;
let pid: string, pidB: string;

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  pm = await mkUser("USER", "หัวหน้าฝ่าย");
  pmB = await mkUser();
  analyst = await mkUser("USER", "นักวิเคราะห์ระบบ");
  tl = await mkUser();
  dev = await mkUser();
  viewer = await mkUser();
  outsider = await mkUser();
  const a = await createProject(admin, { code: "MEET-A", name: "A", pmUserId: pm.id });
  const b = await createProject(admin, { code: "MEET-B", name: "B", pmUserId: pmB.id });
  if (!a.ok || !b.ok) throw new Error("setup");
  pid = a.data.id;
  pidB = b.data.id;
  await join(pid, analyst, ["AN", "PR"]);
  await join(pid, tl, ["TL"]);
  await join(pid, dev, ["PR"]);
  await join(pid, viewer, ["VIEWER"]);
});

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const meeting = async (extra: { meetingDate?: Date; previousId?: string | null } = {}, user: User = pm, projectId = pid) =>
  must(await createMeeting(user, projectId, { topic: "ติดตามงาน", meetingDate: d("2026-12-01"), ...extra }));

const issue = async (m: Meeting, extra: Record<string, unknown> = {}) =>
  must(await addItem(pm, m.id, { kind: "OPEN_ISSUE", text: "ประเด็น", ...extra }));

const task = async (projectId = pid, user: User = pm) => must(await createTask(user, projectId, { title: "งาน" }));

const approve = (m: Meeting) => prisma.meeting.update({ where: { id: m.id }, data: { status: "APPROVED" } });

/** Wait until some session of this database is blocked on a lock (the call under test reached the row lock). */
async function waitForLockWaiter() {
  for (let i = 0; i < 400; i++) {
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row.n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("nothing waited on a lock");
}

/** Open a transaction that holds the meeting row lock (as the service does) and runs `body`; commit later. */
async function holdingMeetingLock(meetingId: string, body: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let ready!: () => void;
  const isReady = new Promise<void>((r) => (ready = r));
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Meeting" WHERE "id" = ${meetingId} FOR UPDATE`;
      await body(tx);
      ready();
      await gate;
    },
    { timeout: 20000 },
  );
  done.catch(() => ready());
  await isReady;
  return {
    commit: async () => {
      release();
      await done;
    },
    /** For `finally`: lets the transaction end (commit, or roll back after an error) and never throws. */
    finish: async () => {
      release();
      await done.catch(() => {});
    },
  };
}

describe("permissions", () => {
  test("PM, AN and ADMIN create; TL, PR, VIEWER, outsiders and other projects' PM are refused", async () => {
    const input = { topic: "t", meetingDate: d("2026-12-01") };
    for (const u of [pm, analyst, admin]) expect((await createMeeting(u, pid, input)).ok).toBe(true);
    for (const u of [tl, dev, viewer, outsider, pmB]) expect(await createMeeting(u, pid, input)).toEqual(denied);
  });

  test("every mutation needs meeting.manage", async () => {
    const m = await meeting();
    const att = must(await addAttendee(pm, m.id, { fullName: "คนนอก" }));
    const it = await issue(m);
    const t = await task();
    const header = { topic: "x", meetingDate: d("2026-12-01") };
    for (const u of [tl, dev, viewer, outsider, pmB]) {
      expect(await updateMeeting(u, m.id, header)).toEqual(denied);
      expect(await addAttendee(u, m.id, { fullName: "x" })).toEqual(denied);
      expect(await updateAttendee(u, att.id, { fullName: "x" })).toEqual(denied);
      expect(await removeAttendee(u, att.id)).toEqual(denied);
      expect(await addItem(u, m.id, { kind: "AGREEMENT", text: "x" })).toEqual(denied);
      expect(await updateItem(u, it.id, { text: "x" })).toEqual(denied);
      expect(await removeItem(u, it.id)).toEqual(denied);
      expect(await linkIssueToTask(u, it.id, t.id)).toEqual(denied);
      expect(await createTaskFromIssue(u, it.id, { title: "x" })).toEqual(denied);
      expect(await deleteMeeting(u, m.id)).toEqual(denied);
    }
    expect(await prisma.meetingItem.count()).toBe(1);
    expect(await prisma.meetingAttendee.count()).toBe(1);
  });

  test("reads need project.view", async () => {
    const m = await meeting();
    expect((await listMeetings(viewer, pid)).map((r) => r.code)).toEqual([m.code]);
    expect((await getMeeting(viewer, pid, m.code))?.id).toBe(m.id);
    expect(await listMeetings(outsider, pid)).toEqual([]);
    expect(await getMeeting(outsider, pid, m.code)).toBeNull();
    expect(await getMeeting(pmB, pidB, m.code)).toBeNull();
  });
});

describe("numbering", () => {
  test("Buddhist year of the meeting date, two digits, kept when the date changes", async () => {
    const dec = await meeting({ meetingDate: d("2026-12-31") });
    const jan = await meeting({ meetingDate: d("2027-01-01") });
    const dec2 = await meeting({ meetingDate: d("2026-06-01") });
    expect([dec.code, jan.code, dec2.code]).toEqual(["MR-2569-01", "MR-2570-01", "MR-2569-02"]);
    const moved = must(await updateMeeting(pm, dec.id, { topic: "ย้ายวัน", meetingDate: d("2027-03-01") }));
    expect(moved.code).toBe("MR-2569-01");
    expect(moved.meetingDate).toEqual(d("2027-03-01"));
    expect((await meeting({ meetingDate: d("2027-02-01") })).code).toBe("MR-2570-02");
  });

  test("each project numbers on its own", async () => {
    expect((await meeting()).code).toBe("MR-2569-01");
    expect((await meeting({}, pmB, pidB)).code).toBe("MR-2569-01");
  });

  test("10 concurrent creations get 10 different codes", async () => {
    const rs = await Promise.all(
      Array.from({ length: 10 }, () => createMeeting(pm, pid, { topic: "t", meetingDate: d("2026-12-01") })),
    );
    const codes = rs.map((r) => must(r).code);
    expect(new Set(codes).size).toBe(10);
    expect([...codes].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `MR-2569-${String(i + 1).padStart(2, "0")}`));
  });

  test("topic and date are required", async () => {
    expect((await createMeeting(pm, pid, { topic: " ", meetingDate: d("2026-12-01") })).ok).toBe(false);
    expect((await createMeeting(pm, pid, { topic: "t" } as never)).ok).toBe(false);
    expect(await prisma.meeting.count()).toBe(0);
  });
});

describe("updateMeeting", () => {
  test("replaces every header field, keeps code and status", async () => {
    const prev = await meeting();
    const m = await meeting();
    const r = must(
      await updateMeeting(pm, m.id, {
        topic: "Kick-off",
        meetingDate: d("2026-12-02"),
        startTime: "09:00",
        endTime: "10:30",
        place: "ห้อง 1",
        recorder: "ก",
        organizer: "ข",
        purpose: "เริ่มโครงการ",
        previousId: prev.id,
        previousNote: "อ้างอิง",
        nextTopic: "ครั้งที่ 2",
        nextDate: d("2026-12-09"),
        nextStartTime: "13:00",
        nextEndTime: "14:00",
        nextPlace: "Online",
      }),
    );
    expect(r).toMatchObject({ code: m.code, status: "DRAFT", startTime: "09:00", nextPlace: "Online", previousId: prev.id });
    const cleared = must(await updateMeeting(pm, m.id, { startTime: "", place: null, previousId: "", nextDate: null }));
    expect(cleared).toMatchObject({ startTime: null, place: null, previousId: null, nextDate: null, endTime: "10:30", topic: "Kick-off" });
  });

  test("partial update: only the given fields change; a given invalid value still fails", async () => {
    const prev = await meeting();
    const m = await meeting();
    must(await updateMeeting(pm, m.id, { topic: "เดิม", meetingDate: d("2026-12-02"), startTime: "09:00", place: "ห้อง 1", previousId: prev.id }));
    const r = must(await updateMeeting(pm, m.id, { purpose: "วัตถุประสงค์ใหม่" }));
    expect(r).toMatchObject({ purpose: "วัตถุประสงค์ใหม่", topic: "เดิม", meetingDate: d("2026-12-02"), startTime: "09:00", place: "ห้อง 1", previousId: prev.id });
    expect((await updateMeeting(pm, m.id, { topic: "" })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { meetingDate: null as unknown as Date })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { startTime: "9:00" })).ok).toBe(false);
    // order is checked against the stored start time
    expect(await updateMeeting(pm, m.id, { endTime: "08:00" })).toEqual({ ok: false, error: "เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม" });
    expect((await updateMeeting(pm, m.id, { previousId: m.id })).ok).toBe(false);
    expect(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ topic: "เดิม", startTime: "09:00", endTime: null, previousId: prev.id });
  });

  test("times must be HH:MM and end not before start", async () => {
    const m = await meeting();
    const base = { topic: "t", meetingDate: d("2026-12-01") };
    expect((await updateMeeting(pm, m.id, { ...base, startTime: "9:00" })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { ...base, startTime: "24:00" })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { ...base, startTime: "10:00", endTime: "09:59" })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { ...base, nextStartTime: "10:00", nextEndTime: "09:00" })).ok).toBe(false);
    expect((await updateMeeting(pm, m.id, { ...base, startTime: "", endTime: "" })).ok).toBe(true);
  });

  test("previous meeting must be another meeting of the same project, without a loop", async () => {
    const a = await meeting();
    const b = await meeting({ previousId: a.id });
    const foreign = await meeting({}, pmB, pidB);
    const base = { topic: "t", meetingDate: d("2026-12-01") };
    expect((await updateMeeting(pm, a.id, { ...base, previousId: foreign.id })).ok).toBe(false);
    expect((await updateMeeting(pm, a.id, { ...base, previousId: a.id })).ok).toBe(false);
    expect((await updateMeeting(pm, a.id, { ...base, previousId: b.id })).ok).toBe(false);
    expect((await createMeeting(pm, pid, { ...base, previousId: foreign.id })).ok).toBe(false);
    expect(await prisma.meeting.count({ where: { projectId: pid } })).toBe(2);
  });
});

describe("carry-forward", () => {
  async function previousWithIssues() {
    const prev = await meeting();
    const owner = analyst;
    const doing = await task();
    const done = await task();
    await prisma.task.update({ where: { id: done.id }, data: { status: "DONE" } });
    await prisma.task.update({ where: { id: doing.id }, data: { status: "DOING" } });
    const open = await issue(prev, { text: "เปิด", ownerId: owner.id, dueDate: d("2026-12-15") });
    await issue(prev, { text: "ปิดเอง", status: "CLOSED" });
    await issue(prev, { text: "Task เสร็จ", taskId: done.id });
    const viaTask = await issue(prev, { text: "Task ยังทำ", taskId: doing.id });
    await prisma.meetingItem.update({ where: { id: viaTask.id }, data: { status: "CLOSED" } });
    await addItem(pm, prev.id, { kind: "ACCOMPLISHED", text: "ไม่ใช่ประเด็นค้าง" });
    return { prev, open, viaTask, doing };
  }

  test("copies open issues by effective status, with carriedFrom, in order", async () => {
    const { prev, open, viaTask, doing } = await previousWithIssues();
    const next = await meeting({ previousId: prev.id });
    const items = await prisma.meetingItem.findMany({ where: { meetingId: next.id }, orderBy: { order: "asc" } });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "OPEN_ISSUE",
      order: 1,
      text: "เปิด",
      ownerId: analyst.id,
      dueDate: d("2026-12-15"),
      status: "OPEN",
      taskId: null,
      carriedFromId: open.id,
      projectId: pid,
    });
    expect(items[1]).toMatchObject({ order: 2, text: "Task ยังทำ", taskId: doing.id, carriedFromId: viaTask.id, status: "OPEN" });
  });

  test("done once: later edits do not sync; changing previousId later copies nothing", async () => {
    const { prev, open } = await previousWithIssues();
    const next = await meeting({ previousId: prev.id });
    await updateItem(pm, open.id, { text: "แก้ทีหลัง" });
    await issue(prev, { text: "เพิ่มทีหลัง" });
    expect(await prisma.meetingItem.count({ where: { meetingId: next.id } })).toBe(2);
    expect(await prisma.meetingItem.findFirst({ where: { meetingId: next.id, text: "แก้ทีหลัง" } })).toBeNull();

    const other = await meeting();
    await updateMeeting(pm, other.id, { topic: "t", meetingDate: d("2026-12-01"), previousId: prev.id });
    expect(await prisma.meetingItem.count({ where: { meetingId: other.id } })).toBe(0);
  });

  test("the previous meeting may be approved", async () => {
    const { prev } = await previousWithIssues();
    await approve(prev);
    const next = await meeting({ previousId: prev.id });
    expect(await prisma.meetingItem.count({ where: { meetingId: next.id } })).toBe(2);
  });
});

describe("effectiveIssueStatus", () => {
  test("a linked task decides; otherwise the stored status", () => {
    expect(effectiveIssueStatus({ status: "OPEN", task: { status: "DONE" } })).toBe("CLOSED");
    expect(effectiveIssueStatus({ status: "CLOSED", task: { status: "DOING" } })).toBe("OPEN");
    expect(effectiveIssueStatus({ status: "CLOSED", task: { status: "BLOCKED" } })).toBe("OPEN");
    expect(effectiveIssueStatus({ status: "OPEN", task: { status: "TODO" } })).toBe("OPEN");
    expect(effectiveIssueStatus({ status: "CLOSED", task: null })).toBe("CLOSED");
    expect(effectiveIssueStatus({ status: "OPEN", task: null })).toBe("OPEN");
  });
});

describe("items", () => {
  test("order is max+1 within the kind; kind is fixed", async () => {
    const m = await meeting();
    const a1 = must(await addItem(pm, m.id, { kind: "ACCOMPLISHED", text: "a1" }));
    const g1 = must(await addItem(pm, m.id, { kind: "AGREEMENT", text: "g1" }));
    const a2 = must(await addItem(pm, m.id, { kind: "ACCOMPLISHED", text: "a2" }));
    await removeItem(pm, a1.id);
    const a3 = must(await addItem(pm, m.id, { kind: "ACCOMPLISHED", text: "a3" }));
    expect([a1.order, g1.order, a2.order, a3.order]).toEqual([1, 1, 2, 3]);
    const upd = must(await updateItem(pm, a2.id, { kind: "AGREEMENT", text: "ใหม่" } as never));
    expect(upd).toMatchObject({ kind: "ACCOMPLISHED", text: "ใหม่" });
  });

  test("text required, kind must be valid", async () => {
    const m = await meeting();
    expect((await addItem(pm, m.id, { kind: "ISSUE", text: "  " })).ok).toBe(false);
    expect((await addItem(pm, m.id, { kind: "NOPE", text: "x" } as never)).ok).toBe(false);
  });

  test("owner, due date, status and task are kept only for open issues", async () => {
    const m = await meeting();
    const t = await task();
    const extra = { ownerId: analyst.id, ownerName: "x", dueDate: d("2026-12-05"), status: "CLOSED" as const, taskId: t.id };
    for (const kind of ["ACCOMPLISHED", "ISSUE", "AGREEMENT"] as const) {
      const it = must(await addItem(pm, m.id, { kind, text: "x", ...extra }));
      expect(it).toMatchObject({ ownerId: null, ownerName: null, dueDate: null, status: "OPEN", taskId: null });
      const upd = must(await updateItem(pm, it.id, { text: "y", ...extra }));
      expect(upd).toMatchObject({ ownerId: null, ownerName: null, dueDate: null, status: "OPEN", taskId: null });
    }
    const oi = must(await addItem(pm, m.id, { kind: "OPEN_ISSUE", text: "x", ...extra }));
    expect(oi).toMatchObject({ ownerId: analyst.id, ownerName: "x", dueDate: d("2026-12-05"), taskId: t.id });
  });

  test("owner must be a project member; owner name defaults to the member's name", async () => {
    const m = await meeting();
    expect((await issue(m, { ownerId: analyst.id })).ownerName).toBe(analyst.fullName);
    expect((await issue(m, { ownerName: "ลูกค้า" })).ownerName).toBe("ลูกค้า");
    expect((await addItem(pm, m.id, { kind: "OPEN_ISSUE", text: "x", ownerId: outsider.id })).ok).toBe(false);
    expect((await addItem(pm, m.id, { kind: "OPEN_ISSUE", text: "x", ownerId: pmB.id })).ok).toBe(false);
  });

  test("status follows a linked task and cannot be changed by hand while linked", async () => {
    const m = await meeting();
    const t = await task();
    const it = await issue(m, { taskId: t.id });
    expect(await updateItem(pm, it.id, { text: "x", status: "CLOSED" })).toEqual({ ok: false, error: "สถานะตาม Task ที่โยงอยู่" });
    expect((await updateItem(pm, it.id, { text: "x", status: "OPEN" })).ok).toBe(true);
    expect((await updateItem(pm, it.id, { text: "x" })).ok).toBe(true);
    const free = await issue(m);
    expect(must(await updateItem(pm, free.id, { text: "x", status: "CLOSED" })).status).toBe("CLOSED");
  });

  test("update keeps the stored task link and status when not sent", async () => {
    const m = await meeting();
    const t = await task();
    const it = await issue(m, { taskId: t.id });
    const upd = must(await updateItem(pm, it.id, { text: "แก้" }));
    expect(upd).toMatchObject({ text: "แก้", taskId: t.id, status: "OPEN" });
  });

  test("a task of another project cannot be linked at creation", async () => {
    const m = await meeting();
    const foreign = await task(pidB, pmB);
    expect((await addItem(pm, m.id, { kind: "OPEN_ISSUE", text: "x", taskId: foreign.id })).ok).toBe(false);
  });
});

describe("attendees", () => {
  test("a member is filled in from the user and membership; all editable", async () => {
    const m = await meeting();
    const a = must(await addAttendee(pm, m.id, { userId: analyst.id }));
    expect(a).toMatchObject({ order: 1, userId: analyst.id, fullName: analyst.fullName, position: "นักวิเคราะห์ระบบ", projectRole: "นักวิเคราะห์", present: true, projectId: pid });
    const b = must(await addAttendee(pm, m.id, { userId: pm.id, fullName: "ชื่ออื่น", position: "ตำแหน่งอื่น", projectRole: "ประธาน", organization: "บริษัท", present: false }));
    expect(b).toMatchObject({ order: 2, fullName: "ชื่ออื่น", position: "ตำแหน่งอื่น", projectRole: "ประธาน", organization: "บริษัท", present: false });
    const upd = must(await updateAttendee(pm, a.id, { userId: analyst.id, fullName: "แก้ชื่อ", present: false }));
    expect(upd).toMatchObject({ fullName: "แก้ชื่อ", present: false, position: null });
  });

  test("an outsider needs a name; a userId must be a project member", async () => {
    const m = await meeting();
    expect((await addAttendee(pm, m.id, {})).ok).toBe(false);
    expect(must(await addAttendee(pm, m.id, { fullName: "ลูกค้า", organization: "กรม" }))).toMatchObject({ userId: null, fullName: "ลูกค้า" });
    expect((await addAttendee(pm, m.id, { userId: outsider.id })).ok).toBe(false);
    expect((await addAttendee(pm, m.id, { userId: pmB.id })).ok).toBe(false);
  });

  test("a member is listed once per meeting", async () => {
    const m = await meeting();
    const a = must(await addAttendee(pm, m.id, { userId: analyst.id }));
    expect((await addAttendee(pm, m.id, { userId: analyst.id })).ok).toBe(false);
    const b = must(await addAttendee(pm, m.id, { fullName: "x" }));
    expect((await updateAttendee(pm, b.id, { userId: analyst.id })).ok).toBe(false);
    expect((await updateAttendee(pm, a.id, { userId: analyst.id, fullName: "y" })).ok).toBe(true);
  });

  test("order is max+1; removing does not renumber", async () => {
    const m = await meeting();
    const a = must(await addAttendee(pm, m.id, { fullName: "1" }));
    const b = must(await addAttendee(pm, m.id, { fullName: "2" }));
    await removeAttendee(pm, b.id);
    const c = must(await addAttendee(pm, m.id, { fullName: "3" }));
    expect([a.order, c.order]).toEqual([1, 2]);
    expect(await prisma.meetingAttendee.count()).toBe(2);
  });
});

describe("linkIssueToTask", () => {
  test("links, relinks and unlinks a task of the same project", async () => {
    const m = await meeting();
    const it = await issue(m);
    const t1 = await task();
    const t2 = await task();
    expect(must(await linkIssueToTask(analyst, it.id, t1.id)).taskId).toBe(t1.id);
    expect(must(await linkIssueToTask(pm, it.id, t2.id)).taskId).toBe(t2.id);
    expect(must(await linkIssueToTask(pm, it.id, null)).taskId).toBeNull();
  });

  test("refuses other projects' tasks, unknown tasks and non-open-issue items", async () => {
    const m = await meeting();
    const it = await issue(m);
    const foreign = await task(pidB, pmB);
    expect((await linkIssueToTask(pm, it.id, foreign.id)).ok).toBe(false);
    expect((await linkIssueToTask(pm, it.id, "nope")).ok).toBe(false);
    const ag = must(await addItem(pm, m.id, { kind: "AGREEMENT", text: "x" }));
    expect((await linkIssueToTask(pm, ag.id, (await task()).id)).ok).toBe(false);
    expect((await linkIssueToTask(pm, "nope", null)).ok).toBe(false);
  });
});

describe("createTaskFromIssue", () => {
  test("AN creates a PLAN/TODO task with the next code and links it", async () => {
    await task();
    const m = await meeting();
    const it = await issue(m);
    const t = must(await createTaskFromIssue(analyst, it.id, { title: "ติดตามประเด็น", assigneeId: dev.id, plannedEnd: d("2026-12-20") }));
    expect(t).toMatchObject({ code: "T-002", kind: "PLAN", status: "TODO", title: "ติดตามประเด็น", assigneeId: dev.id, plannedEnd: d("2026-12-20"), projectId: pid });
    expect((await prisma.meetingItem.findUniqueOrThrow({ where: { id: it.id } })).taskId).toBe(t.id);
  });

  test("fails when the item already has a task; concurrent calls create one task", async () => {
    const m = await meeting();
    const it = await issue(m);
    const rs = await Promise.all([
      createTaskFromIssue(pm, it.id, { title: "a" }),
      createTaskFromIssue(pm, it.id, { title: "b" }),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.task.count()).toBe(1);
    expect((await createTaskFromIssue(pm, it.id, { title: "c" })).ok).toBe(false);
    expect(await prisma.task.count()).toBe(1);
  });

  test("assignee must be a member with a working role; title required; only open issues", async () => {
    const m = await meeting();
    const it = await issue(m);
    expect((await createTaskFromIssue(pm, it.id, { title: "x", assigneeId: viewer.id })).ok).toBe(false);
    expect((await createTaskFromIssue(pm, it.id, { title: "x", assigneeId: outsider.id })).ok).toBe(false);
    expect((await createTaskFromIssue(pm, it.id, { title: "x", assigneeId: pmB.id })).ok).toBe(false);
    expect((await createTaskFromIssue(pm, it.id, { title: " " })).ok).toBe(false);
    const acc = must(await addItem(pm, m.id, { kind: "ACCOMPLISHED", text: "x" }));
    expect((await createTaskFromIssue(pm, acc.id, { title: "x" })).ok).toBe(false);
    expect(await prisma.task.count()).toBe(0);
  });
});

describe("approved meetings", () => {
  test("every mutation is refused and nothing changes", async () => {
    const m = await meeting();
    const att = must(await addAttendee(pm, m.id, { fullName: "x" }));
    const it = await issue(m);
    const t = await task();
    await approve(m);
    const before = JSON.stringify(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id }, include: { attendees: true, items: true } }));
    expect(await updateMeeting(pm, m.id, { topic: "x", meetingDate: d("2026-12-01") })).toEqual(locked);
    expect(await addAttendee(pm, m.id, { fullName: "y" })).toEqual(locked);
    expect(await updateAttendee(pm, att.id, { fullName: "y" })).toEqual(locked);
    expect(await removeAttendee(pm, att.id)).toEqual(locked);
    expect(await addItem(pm, m.id, { kind: "ISSUE", text: "y" })).toEqual(locked);
    expect(await updateItem(pm, it.id, { text: "y" })).toEqual(locked);
    expect(await removeItem(pm, it.id)).toEqual(locked);
    expect(await linkIssueToTask(pm, it.id, t.id)).toEqual(locked);
    expect(await createTaskFromIssue(pm, it.id, { title: "y" })).toEqual(locked);
    expect(await deleteMeeting(pm, m.id)).toEqual(locked);
    expect(await deleteMeeting(admin, m.id)).toEqual(locked);
    const after = JSON.stringify(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id }, include: { attendees: true, items: true } }));
    expect(after).toBe(before);
    expect(await prisma.task.count()).toBe(1);
  });
});

describe("review fixes: refs of other projects, carried items", () => {
  test("updateItem refuses an owner from another project; updateAttendee a user from another project", async () => {
    const m = await meeting();
    const it = await issue(m);
    expect(await updateItem(pm, it.id, { text: "x", ownerId: pmB.id })).toEqual({ ok: false, error: "ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ" });
    expect(await updateItem(pm, it.id, { text: "x", ownerId: outsider.id })).toEqual({ ok: false, error: "ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ" });
    const att = must(await addAttendee(pm, m.id, { fullName: "x" }));
    expect(await updateAttendee(pm, att.id, { userId: pmB.id })).toEqual({ ok: false, error: "ผู้เข้าร่วมที่เลือกต้องเป็นสมาชิกของโครงการ" });
    expect((await prisma.meetingItem.findUniqueOrThrow({ where: { id: it.id } })).ownerId).toBeNull();
    expect((await prisma.meetingAttendee.findUniqueOrThrow({ where: { id: att.id } })).userId).toBeNull();
  });

  test("removeItem refuses an issue a later meeting carried forward, naming that meeting", async () => {
    const prev = await meeting();
    const it = await issue(prev);
    const next = await meeting({ previousId: prev.id });
    expect(await removeItem(pm, it.id)).toEqual({ ok: false, error: `ลบไม่ได้: ถูกอ้างจาก ${next.code}` });
    expect(await prisma.meetingItem.count({ where: { id: it.id } })).toBe(1);
  });
});

describe("final review: an owner who left the project", () => {
  test("editing the issue may keep the stored owner; a different non-member is still refused", async () => {
    const m = await meeting();
    const it = await issue(m, { ownerId: dev.id });
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: pid, userId: dev.id } } });
    const r = must(await updateItem(pm, it.id, { text: "แก้ข้อความ", ownerId: dev.id, ownerName: "" }));
    expect(r).toMatchObject({ text: "แก้ข้อความ", ownerId: dev.id, ownerName: dev.fullName });
    expect(await updateItem(pm, it.id, { text: "x", ownerId: outsider.id })).toEqual({ ok: false, error: "ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ" });
    expect((await prisma.meetingItem.findUniqueOrThrow({ where: { id: it.id } })).ownerId).toBe(dev.id);
  });

  test("the edit form offers the stored owner even when no longer a member", () => {
    const members = [{ id: "u1", label: "สมาชิก" }];
    expect(ownerOptionsFor(members, { ownerId: "u1", ownerName: null })).toEqual(members);
    expect(ownerOptionsFor(members, { ownerId: null, ownerName: "คนนอก" })).toEqual(members);
    expect(ownerOptionsFor(members, { ownerId: "gone", ownerName: "อดีตสมาชิก" })).toEqual([
      ...members,
      { id: "gone", label: "อดีตสมาชิก (ไม่ได้เป็นสมาชิกแล้ว)" },
    ]);
  });
});

describe("review fixes: races", () => {
  test("a mutation waiting on the row lock is refused once a concurrent approval commits", async () => {
    const m = await meeting();
    const held = await holdingMeetingLock(m.id, (tx) => tx.meeting.update({ where: { id: m.id }, data: { status: "APPROVED" } }));
    try {
      const pending = addItem(pm, m.id, { kind: "ISSUE", text: "แทรก" });
      await waitForLockWaiter();
      await held.commit();
      expect(await pending).toEqual(locked);
      expect(await prisma.meetingItem.count({ where: { meetingId: m.id } })).toBe(0);
    } finally {
      await held.finish();
    }
  });

  test("concurrent A.previous=B and B.previous=A: at most one succeeds, never a loop", async () => {
    const a = await meeting();
    const b = await meeting();
    const base = { topic: "t", meetingDate: d("2026-12-01") };
    for (let round = 0; round < 5; round++) {
      await prisma.meeting.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { previousId: null } });
      const [ra, rb] = await Promise.all([
        updateMeeting(pm, a.id, { ...base, previousId: b.id }),
        updateMeeting(pm, b.id, { ...base, previousId: a.id }),
      ]);
      expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
      const [sa, sb] = await Promise.all([a, b].map((x) => prisma.meeting.findUniqueOrThrow({ where: { id: x.id } })));
      expect(sa.previousId === b.id && sb.previousId === a.id).toBe(false);
    }
  });

  test("two concurrent addAttendee for the same member store one row", async () => {
    const m = await meeting();
    const rs = await Promise.all([addAttendee(pm, m.id, { userId: analyst.id }), addAttendee(analyst, m.id, { userId: analyst.id })]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toEqual({ ok: false, error: "ผู้เข้าร่วมนี้มีอยู่แล้ว" });
    expect(await prisma.meetingAttendee.count({ where: { meetingId: m.id, userId: analyst.id } })).toBe(1);
  });

  test("carry-forward waits for a concurrent item removal in the previous meeting and copies what remains", async () => {
    const prev = await meeting();
    const gone = await issue(prev, { text: "ถูกลบ" });
    const kept = await issue(prev, { text: "ยังอยู่" });
    const held = await holdingMeetingLock(prev.id, (tx) => tx.meetingItem.delete({ where: { id: gone.id } }));
    try {
      const pending = createMeeting(pm, pid, { topic: "ครั้งถัดไป", meetingDate: d("2026-12-08"), previousId: prev.id });
      await waitForLockWaiter();
      await held.commit();
      const next = must(await pending);
      const copies = await prisma.meetingItem.findMany({ where: { meetingId: next.id } });
      expect(copies.map((c) => [c.text, c.carriedFromId])).toEqual([["ยังอยู่", kept.id]]);
    } finally {
      await held.finish();
    }
  });

  test("carry-forward from a previous meeting deleted meanwhile fails with a clear message", async () => {
    const prev = await meeting();
    await issue(prev);
    const held = await holdingMeetingLock(prev.id, (tx) => tx.meeting.delete({ where: { id: prev.id } }));
    try {
      const pending = createMeeting(pm, pid, { topic: "ครั้งถัดไป", meetingDate: d("2026-12-08"), previousId: prev.id });
      await waitForLockWaiter();
      await held.commit();
      expect(await pending).toEqual({ ok: false, error: "ไม่พบการประชุมครั้งก่อน อาจถูกลบไปแล้ว" });
      expect(await prisma.meeting.count()).toBe(0);
    } finally {
      await held.finish();
    }
  });
});

describe("lockDraftMeeting", () => {
  test("inside a transaction: passes for a draft, refuses an approved or unknown meeting", async () => {
    const m = await meeting();
    await expect(prisma.$transaction((tx) => lockDraftMeeting(tx, m.id))).resolves.toBeUndefined();
    await approve(m);
    await expect(prisma.$transaction((tx) => lockDraftMeeting(tx, m.id))).rejects.toThrow("การประชุมที่อนุมัติแล้วแก้ไม่ได้");
    await expect(prisma.$transaction((tx) => lockDraftMeeting(tx, "nope"))).rejects.toThrow("ไม่พบการประชุม");
  });
});

describe("deleteMeeting", () => {
  test("refused while another meeting names it as previous or carried its issues", async () => {
    const a = await meeting();
    await issue(a, { text: "ค้าง" });
    const b = await meeting({ previousId: a.id });
    const c = await meeting({ previousId: a.id });
    expect(await deleteMeeting(pm, a.id)).toEqual({ ok: false, error: `ลบไม่ได้: ถูกอ้างจาก ${b.code}, ${c.code}` });
    must(await updateMeeting(pm, b.id, { previousId: null }));
    must(await updateMeeting(pm, c.id, { previousId: null }));
    // previousId cleared, but b and c still hold carried copies
    expect(await deleteMeeting(pm, a.id)).toEqual({ ok: false, error: `ลบไม่ได้: ถูกอ้างจาก ${b.code}, ${c.code}` });
    await prisma.meetingItem.deleteMany({ where: { meetingId: { in: [b.id, c.id] } } });
    expect(await deleteMeeting(pm, a.id)).toEqual({ ok: true, data: null });
  });

  test("removes attendees, items and attachment files; linked tasks stay; codes are not reused", async () => {
    const m = await meeting();
    await addAttendee(pm, m.id, { fullName: "x" });
    const it = await issue(m);
    const t = must(await createTaskFromIssue(pm, it.id, { title: "งานจากประเด็น" }));
    must(
      await addAttachment(pm, pid, { entityType: MEETING_ENTITY, entityId: m.id, kind: "SIGNED", fileName: "s.pdf", mime: "application/pdf", data: Buffer.from("p") }),
    );
    expect(await countStoredFiles(pid)).toBe(1);
    expect(await deleteMeeting(analyst, m.id)).toEqual({ ok: true, data: null });
    expect(await prisma.meeting.count()).toBe(0);
    expect(await prisma.meetingItem.count()).toBe(0);
    expect(await prisma.meetingAttendee.count()).toBe(0);
    expect(await prisma.attachment.count()).toBe(0);
    expect(await countStoredFiles(pid)).toBe(0);
    expect(await prisma.task.findUnique({ where: { id: t.id } })).not.toBeNull();
    expect((await meeting()).code).toBe("MR-2569-02");
  });

  test("unknown meeting", async () => {
    expect((await deleteMeeting(pm, "nope")).ok).toBe(false);
  });
});

describe("reads", () => {
  test("listMeetings newest first", async () => {
    await meeting({ meetingDate: d("2026-11-01") });
    await meeting({ meetingDate: d("2026-12-01") });
    await meeting({ meetingDate: d("2026-12-01") });
    const rows = await listMeetings(viewer, pid);
    expect(rows.map((r) => r.code)).toEqual(["MR-2569-03", "MR-2569-02", "MR-2569-01"]);
    expect(rows[0]).toMatchObject({ topic: "ติดตามงาน", meetingDate: d("2026-12-01"), status: "DRAFT" });
  });

  test("getMeeting returns attendees and items in order with task, carried-from and effective status", async () => {
    const prev = await meeting();
    const carried = await issue(prev, { text: "ยกมา" });
    const m = await meeting({ previousId: prev.id });
    await addAttendee(pm, m.id, { fullName: "B" });
    await addAttendee(pm, m.id, { userId: analyst.id });
    await addItem(pm, m.id, { kind: "AGREEMENT", text: "g" });
    await addItem(pm, m.id, { kind: "ACCOMPLISHED", text: "a" });
    const own = await issue(m, { text: "ใหม่", ownerId: dev.id });
    const t = must(await createTaskFromIssue(pm, own.id, { title: "x" }));
    await prisma.task.update({ where: { id: t.id }, data: { status: "DONE" } });
    must(
      await addAttachment(pm, pid, { entityType: MEETING_ENTITY, entityId: m.id, kind: "SIGNED", fileName: "s.pdf", mime: "application/pdf", data: Buffer.from("p") }),
    );

    const detail = await getMeeting(viewer, pid, m.code);
    if (!detail) throw new Error("missing");
    expect(detail.previous).toMatchObject({ id: prev.id, code: prev.code });
    expect(detail.attendees.map((a) => a.fullName)).toEqual(["B", analyst.fullName]);
    expect(detail.items.map((i) => [i.kind, i.text])).toEqual([
      ["ACCOMPLISHED", "a"],
      ["OPEN_ISSUE", "ยกมา"],
      ["OPEN_ISSUE", "ใหม่"],
      ["AGREEMENT", "g"],
    ]);
    const [, carriedRow, ownRow] = detail.items;
    expect(carriedRow).toMatchObject({ carriedFrom: { meetingCode: prev.code }, effectiveStatus: "OPEN", task: null });
    expect(carriedRow.carriedFrom?.itemId).toBe(carried.id);
    expect(ownRow).toMatchObject({ ownerName: dev.fullName, effectiveStatus: "CLOSED", task: { code: t.code, status: "DONE" } });
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0]).toMatchObject({ kind: "SIGNED", fileName: "s.pdf", uploadedBy: pm.fullName });
    expect(await getMeeting(viewer, pid, "MR-2569-99")).toBeNull();
  });

  test("listIssuesForTask names the meetings whose issues link to the task", async () => {
    const t = await task();
    const a = await meeting();
    const b = await meeting();
    await issue(b, { text: "จาก b", taskId: t.id });
    await issue(a, { text: "จาก a", taskId: t.id });
    expect(await listIssuesForTask(t.id)).toEqual([
      { meetingCode: a.code, text: "จาก a" },
      { meetingCode: b.code, text: "จาก b" },
    ]);
    expect(await listIssuesForTask((await task()).id)).toEqual([]);
  });
});

// ---------- Task 4: approve, revert, export ----------

const WP07_DIR = path.join("02_Project Plan Execution, Assessment and Control (PM.02-PM.03)", "05_WP07_Meeting Record");
const WP07_FILE = "WP07_meeting_record.docx";
const shippedWp07 = () => fs.readFileSync(path.resolve("templates-default", WP07_DIR, WP07_FILE));
const docText = (buf: Buffer) =>
  [...new PizZip(buf).file("word/document.xml")!.asText().matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

describe("approve, revert, export", () => {
  let overrideRoot: string;
  const savedEnv = { dir: process.env.TEMPLATES_DIR, def: process.env.TEMPLATES_DEFAULT_DIR };
  beforeEach(() => {
    overrideRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mr-export-")));
    process.env.TEMPLATES_DIR = overrideRoot;
    process.env.TEMPLATES_DEFAULT_DIR = path.resolve("templates-default");
  });
  afterEach(() => {
    fs.rmSync(overrideRoot, { recursive: true, force: true });
    for (const [key, value] of [["TEMPLATES_DIR", savedEnv.dir], ["TEMPLATES_DEFAULT_DIR", savedEnv.def]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  /** An admin override of the WP07 template: the shipped document.xml passed through `edit`. */
  function overrideTemplate(edit: (xml: string) => string) {
    const zip = new PizZip(shippedWp07());
    zip.file("word/document.xml", edit(zip.file("word/document.xml")!.asText()));
    const dir = path.join(overrideRoot, WP07_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, WP07_FILE), zip.generate({ type: "nodebuffer" }));
  }

  /** A meeting with an attendee and an open issue turned into a task. */
  async function fullMeeting() {
    const m = await meeting();
    must(await updateMeeting(pm, m.id, { topic: "ทบทวนแผน {x} <b> & co", meetingDate: d("2026-12-01"), place: "ห้อง 1" }));
    must(await addAttendee(pm, m.id, { userId: analyst.id }));
    const it = await issue(m, { text: "ยืนยันรูปแบบรายงาน" });
    const t = must(await createTaskFromIssue(pm, it.id, { title: "ทำรายงาน" }));
    return { m, t };
  }

  test("only PM and ADMIN approve and revert", async () => {
    const m = await meeting();
    for (const u of [analyst, tl, dev, viewer, outsider, pmB]) expect(await approveMeeting(u, m.id)).toEqual(denied);
    expect((await approveMeeting(pm, m.id)).ok).toBe(true);
    for (const u of [analyst, tl, dev, viewer, outsider, pmB]) expect(await revertMeeting(u, m.id)).toEqual(denied);
    expect((await revertMeeting(admin, m.id)).ok).toBe(true);
    expect((await approveMeeting(admin, m.id)).ok).toBe(true);
    expect((await approveMeeting(pm, "nope")).ok).toBe(false);
    expect((await revertMeeting(pm, "nope")).ok).toBe(false);
  });

  test("approve freezes the filled WP07 as an attachment of the meeting and sets the approval fields", async () => {
    const { m, t } = await fullMeeting();
    const approved = must(await approveMeeting(pm, m.id));
    expect(approved).toMatchObject({ status: "APPROVED", approvedById: pm.id });
    expect(approved.approvedAt).toBeInstanceOf(Date);
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } });
    expect(att).toMatchObject({
      projectId: pid,
      entityType: MEETING_ENTITY,
      entityId: m.id,
      kind: "OTHER",
      fileName: `MEET-A_${m.code}.docx`,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadedById: pm.id,
    });
    expect(await countStoredFiles(pid)).toBe(1);
    const text = docText((await openFile(att.storedPath)) as Buffer);
    expect(text).toContain("ทบทวนแผน {x} &lt;b&gt; &amp; co");
    expect(text).toContain(t.code);
    expect(text).toContain(analyst.fullName);
    expect(text).toContain("☐  Draft");
    expect(text).toContain("☑  Approved");
    expect(text).not.toMatch(/\{(mrNo|topic|purpose|#|\/)/);
  });

  test("approve only from Draft; a second approval adds no file", async () => {
    const m = await meeting();
    must(await approveMeeting(pm, m.id));
    expect((await approveMeeting(pm, m.id)).ok).toBe(false);
    expect(await prisma.attachment.count()).toBe(1);
    expect(await countStoredFiles(pid)).toBe(1);
  });

  test("a broken template: approve fails naming the WP and the tag; status unchanged; no file or attachment left", async () => {
    const m = await meeting();
    overrideTemplate((xml) => xml.replace("{purpose}", "{purpse}"));
    const r = await approveMeeting(pm, m.id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("WP07");
    expect(r.error).toContain("{purpose}");
    expect(r.error).toContain("{purpse}");
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("DRAFT");
    expect(await prisma.attachment.count()).toBe(0);
    expect(await countStoredFiles(pid)).toBe(0);

    overrideTemplate((xml) => xml.replace("{/attendees}", "{/attendee}"));
    const unclosed = await approveMeeting(pm, m.id);
    expect(unclosed.ok).toBe(false);
    expect(!unclosed.ok && unclosed.error).toContain("attendee");
    const exported = await exportMeeting(pm, m.id);
    expect(exported.ok).toBe(false);
    expect(!exported.ok && exported.error).toContain("WP07");
    expect(await countStoredFiles(pid)).toBe(0);
  });

  test("a missing template file: approve and export fail with a Thai message naming WP07", async () => {
    const m = await meeting();
    process.env.TEMPLATES_DEFAULT_DIR = overrideRoot; // empty: no WP07 anywhere
    expect(await approveMeeting(pm, m.id)).toEqual({ ok: false, error: expect.stringContaining("ไม่พบไฟล์ template ของ WP07") });
    expect(await exportMeeting(pm, m.id)).toEqual({ ok: false, error: expect.stringContaining("ไม่พบไฟล์ template ของ WP07") });
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("DRAFT");
  });

  test("revert returns to Draft, removes the frozen attachment and its file; only from Approved; re-approval makes a new copy", async () => {
    const m = await meeting();
    expect((await revertMeeting(pm, m.id)).ok).toBe(false);
    const first = must(await approveMeeting(pm, m.id));
    const reverted = must(await revertMeeting(pm, m.id));
    expect(reverted).toMatchObject({ status: "DRAFT", approvedAt: null, approvedById: null, approvedFileId: null });
    expect(await prisma.attachment.count()).toBe(0);
    expect(await countStoredFiles(pid)).toBe(0);
    expect((await revertMeeting(pm, m.id)).ok).toBe(false);
    // editable again
    expect((await addItem(pm, m.id, { kind: "AGREEMENT", text: "ข้อตกลงใหม่" })).ok).toBe(true);
    const second = must(await approveMeeting(pm, m.id));
    expect(second.approvedFileId).not.toBe(first.approvedFileId);
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: second.approvedFileId! } });
    expect(docText(await openFile(att.storedPath))).toContain("ข้อตกลงใหม่");
    expect(await countStoredFiles(pid)).toBe(1);
  });

  test("export of a Draft is filled now, for every viewer; outsiders are refused", async () => {
    const { m } = await fullMeeting();
    const r = must(await exportMeeting(viewer, m.id));
    expect(r.fileName).toBe(`MEET-A_${m.code}.docx`);
    let text = docText(r.data);
    expect(text).toContain("☑  Draft");
    expect(text).toContain("☐  Approved");
    must(await updateMeeting(pm, m.id, { topic: "หัวข้อใหม่", meetingDate: d("2026-12-01") }));
    text = docText(must(await exportMeeting(viewer, m.id)).data);
    expect(text).toContain("หัวข้อใหม่");
    expect(await exportMeeting(outsider, m.id)).toEqual(denied);
    expect(await exportMeeting(pmB, m.id)).toEqual(denied);
    expect((await exportMeeting(pm, "nope")).ok).toBe(false);
    expect(await countStoredFiles(pid)).toBe(0);
  });

  test("export of an Approved meeting is the stored file byte for byte, also after the template and a linked task change", async () => {
    const { m, t } = await fullMeeting();
    const approved = must(await approveMeeting(pm, m.id));
    const stored = await openFile((await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } })).storedPath);
    const first = must(await exportMeeting(viewer, m.id));
    expect(first.fileName).toBe(`MEET-A_${m.code}.docx`);
    expect(first.data.equals(stored)).toBe(true);
    expect(docText(first.data)).toContain(`ค้าง (${t.code})`);

    await prisma.task.update({ where: { id: t.id }, data: { status: "DONE" } });
    overrideTemplate((xml) => xml.replace("Purpose of meeting", "Purpose CHANGED"));
    const later = must(await exportMeeting(viewer, m.id));
    expect(later.data.equals(stored)).toBe(true);
    expect(docText(later.data)).toContain(`ค้าง (${t.code})`);
    expect(docText(later.data)).toContain("Purpose of meeting");
  });

  test("an Approved meeting whose stored file is gone: export says ไม่พบไฟล์ฉบับอนุมัติ", async () => {
    const m = await meeting();
    const approved = must(await approveMeeting(pm, m.id));
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } });
    fs.rmSync(path.resolve(process.env.FILE_STORAGE_DIR ?? "./test-storage", att.storedPath));
    expect(await exportMeeting(pm, m.id)).toEqual({ ok: false, error: "ไม่พบไฟล์ฉบับอนุมัติ" });
    await prisma.attachment.delete({ where: { id: att.id } });
    expect(await exportMeeting(pm, m.id)).toEqual({ ok: false, error: "ไม่พบไฟล์ฉบับอนุมัติ" });
  });

  test("the frozen copy is not among the meeting's attachments; signed copies are still accepted after approval", async () => {
    const m = await meeting();
    must(await approveMeeting(pm, m.id));
    expect((await getMeeting(viewer, pid, m.code))?.attachments).toEqual([]);
    must(
      await addAttachment(dev, pid, { entityType: MEETING_ENTITY, entityId: m.id, kind: "SIGNED", fileName: "signed.pdf", mime: "application/pdf", data: Buffer.from("p") }),
    );
    const detail = await getMeeting(viewer, pid, m.code);
    expect(detail?.attachments.map((a) => a.fileName)).toEqual(["signed.pdf"]);
    expect(detail?.approvedFileId).not.toBeNull();
  });

  test("after approveMeeting every change is refused (header, attendees, items, links, task, delete)", async () => {
    const m = await meeting();
    const att = must(await addAttendee(pm, m.id, { fullName: "x" }));
    const it = await issue(m);
    const t = await task();
    must(await approveMeeting(pm, m.id));
    const before = JSON.stringify(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id }, include: { attendees: true, items: true } }));
    for (const u of [pm, analyst, admin]) {
      expect(await updateMeeting(u, m.id, { topic: "x", meetingDate: d("2026-12-01") })).toEqual(locked);
      expect(await addAttendee(u, m.id, { fullName: "y" })).toEqual(locked);
      expect(await updateAttendee(u, att.id, { fullName: "y" })).toEqual(locked);
      expect(await removeAttendee(u, att.id)).toEqual(locked);
      expect(await addItem(u, m.id, { kind: "ISSUE", text: "y" })).toEqual(locked);
      expect(await updateItem(u, it.id, { text: "y" })).toEqual(locked);
      expect(await removeItem(u, it.id)).toEqual(locked);
      expect(await linkIssueToTask(u, it.id, t.id)).toEqual(locked);
      expect(await createTaskFromIssue(u, it.id, { title: "y" })).toEqual(locked);
      expect(await deleteMeeting(u, m.id)).toEqual(locked);
    }
    const after = JSON.stringify(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id }, include: { attendees: true, items: true } }));
    expect(after).toBe(before);
  });

  test("approval waits for a write holding the meeting lock and freezes the data including it", async () => {
    const m = await meeting();
    const held = await holdingMeetingLock(m.id, (tx) =>
      tx.meetingItem.create({ data: { meetingId: m.id, projectId: pid, kind: "AGREEMENT", order: 1, text: "แทรกก่อนอนุมัติ" } }),
    );
    try {
      const pending = approveMeeting(pm, m.id);
      await waitForLockWaiter();
      await held.commit();
      const approved = must(await pending);
      const att = await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } });
      expect(docText(await openFile(att.storedPath))).toContain("แทรกก่อนอนุมัติ");
    } finally {
      await held.finish();
    }
  });

  test("the approval transaction failing after the file was saved leaves no file and the meeting Draft", async () => {
    const m = await meeting();
    // Test database only: make the attachment insert fail, i.e. after saveFile ran inside the transaction.
    // (resetDb also drops this trigger, so a killed run cannot leave it behind.)
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_attachment ON "Attachment"`);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_fail_attachment() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'attachment insert refused by test'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_attachment BEFORE INSERT ON "Attachment" FOR EACH ROW EXECUTE FUNCTION test_fail_attachment()`,
    );
    try {
      const outcome = await approveMeeting(pm, m.id).then(
        (r) => r,
        (e: unknown) => e,
      );
      expect(outcome).not.toMatchObject({ ok: true });
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_attachment ON "Attachment"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_fail_attachment()`);
    }
    expect(await countStoredFiles(pid)).toBe(0);
    expect(await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: "DRAFT", approvedFileId: null });
    expect(await prisma.attachment.count()).toBe(0);
  });

  test("export of a meeting reverted after it was read as Approved gives the filled Draft", async () => {
    const m = await meeting();
    const approved = must(await approveMeeting(pm, m.id));
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } });
    // The race: export has read the meeting as Approved; a revert commits just before it opens the frozen file.
    storageHooks.beforeOpen = async () => {
      must(await revertMeeting(pm, m.id));
    };
    const r = await exportMeeting(pm, m.id);
    expect(await prisma.attachment.count({ where: { id: att.id } })).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.ok && docText(r.data.data)).toContain("☑  Draft");
  });

  test("revert logs a frozen file it could not delete", async () => {
    const m = await meeting();
    const approved = must(await approveMeeting(pm, m.id));
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: approved.approvedFileId! } });
    // a stored path outside the storage root makes deleteFile throw
    await prisma.attachment.update({ where: { id: att.id }, data: { storedPath: "../outside.docx" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      must(await revertMeeting(pm, m.id));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("../outside.docx"), expect.anything());
    } finally {
      spy.mockRestore();
    }
    fs.rmSync(path.resolve(process.env.FILE_STORAGE_DIR ?? "./test-storage", att.storedPath), { force: true });
  });

  test("two concurrent approvals: one succeeds and one file is stored", async () => {
    const m = await meeting();
    const rs = await Promise.all([approveMeeting(pm, m.id), approveMeeting(admin, m.id)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.attachment.count()).toBe(1);
    expect(await countStoredFiles(pid)).toBe(1);
  });

  test("approve and revert racing: the meeting ends consistent with its frozen file", async () => {
    const m = await meeting();
    must(await approveMeeting(pm, m.id));
    await Promise.all([revertMeeting(pm, m.id), approveMeeting(pm, m.id)]);
    const now = await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } });
    const files = await prisma.attachment.count();
    expect(now.status === "APPROVED" ? files === 1 && now.approvedFileId !== null : files === 0 && now.approvedFileId === null).toBe(true);
    expect(await countStoredFiles(pid)).toBe(files);
  });
});
