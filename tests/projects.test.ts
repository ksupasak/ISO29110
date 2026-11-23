import { beforeEach, describe, expect, test } from "vitest";
import type { SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import {
  createProject,
  getProjectByCode,
  listVisibleProjects,
  normalizeProjectCode,
  updateProject,
} from "@/features/projects/service";

let n = 0;
function mkUser(systemRole: SystemRole = "USER"): Promise<User> {
  n += 1;
  return prisma.user.create({ data: { username: `u${n}`, passwordHash: "x", fullName: `User ${n}`, systemRole } });
}

let admin: User;
let pm: User;
let outsider: User;

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  pm = await mkUser();
  outsider = await mkUser();
});

test("admin creates project with PM and 23 WP slots", async () => {
  const r = await createProject(admin, { code: "INT-2569-001", name: "TaskDoc", pmUserId: pm.id });
  expect(r.ok).toBe(true);
  const p = await prisma.project.findUniqueOrThrow({
    where: { code: "INT-2569-001" },
    include: { members: true, wpDocuments: true },
  });
  expect(p.members).toMatchObject([{ userId: pm.id, roles: ["PM"], primaryRole: "PM" }]);
  expect(p.wpDocuments).toHaveLength(23);
  expect(p.wpDocuments.every((d) => d.status === "Draft")).toBe(true);
});

test("code is normalised and duplicates rejected", async () => {
  await createProject(admin, { code: " int-2569-001 ", name: "A", pmUserId: pm.id });
  expect(await prisma.project.count({ where: { code: "INT-2569-001" } })).toBe(1);
  const dup = await createProject(admin, { code: "INT-2569-001", name: "B", pmUserId: pm.id });
  expect(dup).toEqual({ ok: false, error: "รหัสโครงการนี้ถูกใช้แล้ว" });
  expect(await prisma.wpDocument.count()).toBe(23);
});

test("non-admin cannot create a project", async () => {
  expect(await createProject(pm, { code: "X-1", name: "X", pmUserId: pm.id })).toEqual({
    ok: false,
    error: "ไม่มีสิทธิ์ดำเนินการ",
  });
});

test("visibility: members and admin only", async () => {
  await createProject(admin, { code: "P-001", name: "P", pmUserId: pm.id });
  expect((await listVisibleProjects(pm)).map((p) => p.code)).toEqual(["P-001"]);
  expect(await listVisibleProjects(outsider)).toEqual([]);
  expect(await getProjectByCode(outsider, "P-001")).toBeNull();
  expect((await getProjectByCode(pm, "p-001"))?.code).toBe("P-001");
  expect((await listVisibleProjects(admin)).length).toBe(1);
});

test("invalid code, dates and unknown PM are rejected without writing", async () => {
  const bad = await createProject(admin, { code: "a", name: "A", pmUserId: pm.id });
  expect(bad.ok).toBe(false);
  const dates = await createProject(admin, {
    code: "P-002",
    name: "A",
    pmUserId: pm.id,
    startDate: new Date("2026-02-01"),
    endDate: new Date("2026-01-01"),
  });
  expect(dates).toEqual({ ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });
  const noPm = await createProject(admin, { code: "P-003", name: "A", pmUserId: "nope" });
  expect(noPm.ok).toBe(false);
  expect(await prisma.project.count()).toBe(0);
});

test("normalizeProjectCode trims and upper-cases", () => {
  expect(normalizeProjectCode("  ab-1 ")).toBe("AB-1");
});

describe("updateProject", () => {
  test("description can be set, kept and cleared", async () => {
    const created = await createProject(admin, { code: "P-001", name: "Old", pmUserId: pm.id });
    if (!created.ok) throw new Error("setup failed");
    const id = created.data.id;
    expect((await updateProject(pm, id, { description: "  รายละเอียด  " })).ok).toBe(true);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).description).toBe("รายละเอียด");
    expect((await updateProject(pm, id, { name: "New" })).ok).toBe(true);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).description).toBe("รายละเอียด");
    expect((await updateProject(pm, id, { description: "" })).ok).toBe(true);
    expect((await prisma.project.findUniqueOrThrow({ where: { id } })).description).toBeNull();
  });

  test("PM can edit, other members and outsiders cannot", async () => {
    const created = await createProject(admin, { code: "P-001", name: "Old", pmUserId: pm.id });
    if (!created.ok) throw new Error("setup failed");
    const id = created.data.id;
    const viewer = await mkUser();
    await prisma.projectMember.create({ data: { projectId: id, userId: viewer.id, roles: ["VIEWER"], primaryRole: "VIEWER" } });

    expect((await updateProject(pm, id, { name: "New", status: "ACTIVE" })).ok).toBe(true);
    const p = await prisma.project.findUniqueOrThrow({ where: { id } });
    expect(p).toMatchObject({ name: "New", status: "ACTIVE", code: "P-001" });

    const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
    expect(await updateProject(viewer, id, { name: "Z" })).toEqual(denied);
    expect(await updateProject(outsider, id, { name: "Z" })).toEqual(denied);
    expect((await updateProject(admin, id, { name: "Adm" })).ok).toBe(true);
  });

  describe("partial updates", () => {
    async function setup() {
      const created = await createProject(admin, {
        code: "P-009",
        name: "Old",
        shortName: "Short",
        customerName: "Cust",
        startDate: new Date("2026-01-10"),
        endDate: new Date("2026-06-30"),
        budget: 1234.5,
        pmUserId: pm.id,
      });
      if (!created.ok) throw new Error("setup failed");
      return created.data.id;
    }
    const load = (id: string) => prisma.project.findUniqueOrThrow({ where: { id } });

    test("fields not sent are left untouched; null clears only that field", async () => {
      const id = await setup();
      expect((await updateProject(pm, id, { name: "New" })).ok).toBe(true);
      const p = await load(id);
      expect(p.name).toBe("New");
      expect(p.shortName).toBe("Short");
      expect(p.customerName).toBe("Cust");
      expect(p.startDate).toEqual(new Date("2026-01-10"));
      expect(p.endDate).toEqual(new Date("2026-06-30"));
      expect(p.budget?.toString()).toBe("1234.5");

      expect((await updateProject(pm, id, { customerName: null })).ok).toBe(true);
      const q = await load(id);
      expect(q.customerName).toBeNull();
      expect(q).toMatchObject({ name: "New", shortName: "Short" });
      expect(q.startDate).toEqual(new Date("2026-01-10"));
      expect(q.budget?.toString()).toBe("1234.5");
    });

    test("empty string clears a text field", async () => {
      const id = await setup();
      expect((await updateProject(pm, id, { shortName: "  " })).ok).toBe(true);
      expect((await load(id)).shortName).toBeNull();
    });

    test("date order is checked against stored values when only one date is sent", async () => {
      const id = await setup();
      const bad = { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" };
      expect(await updateProject(pm, id, { endDate: new Date("2026-01-01") })).toEqual(bad);
      expect(await updateProject(pm, id, { startDate: new Date("2026-12-01") })).toEqual(bad);
      expect((await load(id)).endDate).toEqual(new Date("2026-06-30"));
      expect((await updateProject(pm, id, { endDate: new Date("2026-07-01") })).ok).toBe(true);
    });
  });
});
