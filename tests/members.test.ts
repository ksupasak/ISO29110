import { beforeEach, describe, expect, test } from "vitest";
import type { ProjectRole, SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createProject } from "@/features/projects/service";
import {
  addMember,
  listAssignableUsers,
  listMembers,
  removeMember,
  updateMember,
} from "@/features/members/service";

const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
const needPm = { ok: false, error: "โครงการต้องมี PM อย่างน้อย 1 คน" };

let n = 0;
function mkUser(systemRole: SystemRole = "USER", active = true): Promise<User> {
  n += 1;
  return prisma.user.create({
    data: { username: `m${n}`, passwordHash: "x", fullName: `Member ${n}`, position: `Pos ${n}`, systemRole, active },
  });
}

let admin: User;
let pm: User;
let analyst: User;
let outsider: User;
let projectId: string;

async function memberId(userId: string): Promise<string> {
  return (await prisma.projectMember.findUniqueOrThrow({ where: { projectId_userId: { projectId, userId } } })).id;
}

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  pm = await mkUser();
  analyst = await mkUser();
  outsider = await mkUser();
  const r = await createProject(admin, { code: "TEAM-001", name: "Team", pmUserId: pm.id });
  if (!r.ok) throw new Error(r.error);
  projectId = r.data.id;
  await prisma.projectMember.create({
    data: { projectId, userId: analyst.id, roles: ["AN"], primaryRole: "AN", dailyRate: 1800 },
  });
});

describe("addMember", () => {
  test("PM adds a member with several roles and a daily rate", async () => {
    const r = await addMember(pm, projectId, {
      userId: outsider.id,
      roles: ["PR", "QA"],
      primaryRole: "PR",
      dailyRate: 2500,
    });
    expect(r.ok).toBe(true);
    const m = await prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId, userId: outsider.id } },
    });
    expect(m).toMatchObject({ roles: ["PR", "QA"], primaryRole: "PR" });
    expect(m.dailyRate?.toFixed(2)).toBe("2500.00");
  });

  test("non-PM members and outsiders are denied; admin may add", async () => {
    const input = { userId: outsider.id, roles: ["PR" as ProjectRole], primaryRole: "PR" as ProjectRole };
    expect(await addMember(analyst, projectId, input)).toEqual(denied);
    expect(await addMember(outsider, projectId, input)).toEqual(denied);
    expect((await addMember(admin, projectId, input)).ok).toBe(true);
  });

  test("duplicate add is rejected", async () => {
    const r = await addMember(pm, projectId, { userId: analyst.id, roles: ["PR"], primaryRole: "PR" });
    expect(r).toEqual({ ok: false, error: "ผู้ใช้นี้อยู่ในทีมแล้ว" });
  });

  test("primaryRole must be among roles; roles must be non-empty", async () => {
    const bad = { ok: false, error: "บทบาทหลักต้องอยู่ในบทบาทที่เลือก" };
    expect(await addMember(pm, projectId, { userId: outsider.id, roles: ["PR", "QA"], primaryRole: "TL" })).toEqual(bad);
    const empty = await addMember(pm, projectId, { userId: outsider.id, roles: [], primaryRole: "PR" });
    expect(empty.ok).toBe(false);
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(2);
  });

  test("inactive or unknown users cannot be added; negative rate rejected", async () => {
    const off = await mkUser("USER", false);
    expect((await addMember(pm, projectId, { userId: off.id, roles: ["PR"], primaryRole: "PR" })).ok).toBe(false);
    expect((await addMember(pm, projectId, { userId: "nope", roles: ["PR"], primaryRole: "PR" })).ok).toBe(false);
    const neg = await addMember(pm, projectId, { userId: outsider.id, roles: ["PR"], primaryRole: "PR", dailyRate: -1 });
    expect(neg.ok).toBe(false);
  });
});

describe("updateMember", () => {
  test("PM changes roles and rate; null clears the rate; undefined keeps it", async () => {
    const id = await memberId(analyst.id);
    expect((await updateMember(pm, id, { roles: ["AN", "QA"], primaryRole: "QA", dailyRate: 2000 })).ok).toBe(true);
    let m = await prisma.projectMember.findUniqueOrThrow({ where: { id } });
    expect(m).toMatchObject({ roles: ["AN", "QA"], primaryRole: "QA" });
    expect(m.dailyRate?.toFixed(2)).toBe("2000.00");
    expect((await updateMember(pm, id, { roles: ["AN"], primaryRole: "AN" })).ok).toBe(true);
    m = await prisma.projectMember.findUniqueOrThrow({ where: { id } });
    expect(m.dailyRate?.toFixed(2)).toBe("2000.00");
    expect((await updateMember(pm, id, { roles: ["AN"], primaryRole: "AN", dailyRate: null })).ok).toBe(true);
    m = await prisma.projectMember.findUniqueOrThrow({ where: { id } });
    expect(m.dailyRate).toBeNull();
  });

  test("non-PM denied; primaryRole outside roles rejected; unknown member rejected", async () => {
    const id = await memberId(analyst.id);
    expect(await updateMember(analyst, id, { roles: ["PM"], primaryRole: "PM" })).toEqual(denied);
    expect(await updateMember(pm, id, { roles: ["AN"], primaryRole: "PR" })).toEqual({
      ok: false,
      error: "บทบาทหลักต้องอยู่ในบทบาทที่เลือก",
    });
    expect((await updateMember(pm, "nope", { roles: ["AN"], primaryRole: "AN" })).ok).toBe(false);
  });

  test("the last PM cannot lose PM, but can once another PM exists", async () => {
    const id = await memberId(pm.id);
    expect(await updateMember(pm, id, { roles: ["TL"], primaryRole: "TL" })).toEqual(needPm);
    await updateMember(pm, await memberId(analyst.id), { roles: ["PM", "AN"], primaryRole: "AN" });
    expect((await updateMember(pm, id, { roles: ["TL"], primaryRole: "TL" })).ok).toBe(true);
  });
});

describe("removeMember", () => {
  test("removing the only PM fails; succeeds once a second PM exists", async () => {
    const pmMember = await memberId(pm.id);
    expect(await removeMember(pm, pmMember)).toEqual(needPm);
    await addMember(pm, projectId, { userId: outsider.id, roles: ["PM"], primaryRole: "PM" });
    expect((await removeMember(pm, pmMember)).ok).toBe(true);
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(2);
  });

  test("non-PM denied; PM removes a regular member", async () => {
    const id = await memberId(analyst.id);
    expect(await removeMember(analyst, id)).toEqual(denied);
    expect((await removeMember(pm, id)).ok).toBe(true);
    expect((await removeMember(pm, id)).ok).toBe(false);
  });
});

describe("listMembers", () => {
  test("dailyRate is a 2-decimal string for PM and admin, null for others", async () => {
    await prisma.projectMember.update({
      where: { id: await memberId(pm.id) },
      data: { dailyRate: 2500 },
    });
    const asPm = await listMembers(pm, projectId);
    expect(asPm.find((m) => m.userId === pm.id)).toMatchObject({
      fullName: pm.fullName,
      position: pm.position,
      roles: ["PM"],
      primaryRole: "PM",
      dailyRate: "2500.00",
    });
    expect(asPm.find((m) => m.userId === analyst.id)?.dailyRate).toBe("1800.00");
    const asAdmin = await listMembers(admin, projectId);
    expect(asAdmin.find((m) => m.userId === pm.id)?.dailyRate).toBe("2500.00");
    const asAn = await listMembers(analyst, projectId);
    expect(asAn).toHaveLength(2);
    expect(asAn.every((m) => m.dailyRate === null)).toBe(true);
    expect(JSON.stringify(asAn)).not.toContain("passwordHash");
  });

  test("member without a rate gets null even for the PM; outsiders see nothing", async () => {
    await prisma.projectMember.update({ where: { id: await memberId(analyst.id) }, data: { dailyRate: null } });
    expect((await listMembers(pm, projectId)).find((m) => m.userId === analyst.id)?.dailyRate).toBeNull();
    expect(await listMembers(outsider, projectId)).toEqual([]);
  });
});

describe("listAssignableUsers", () => {
  test("PM and admin get active users not in the project; others get nothing", async () => {
    await mkUser("USER", false);
    const asPm = await listAssignableUsers(pm, projectId);
    expect(asPm.map((u) => u.id).sort()).toEqual([admin.id, outsider.id].sort());
    expect(asPm[0]).toEqual({ id: expect.any(String), fullName: expect.any(String), position: expect.any(String) });
    expect(Object.keys(asPm[0]).sort()).toEqual(["fullName", "id", "position"]);
    expect(await listAssignableUsers(admin, projectId)).toHaveLength(2);
    expect(await listAssignableUsers(analyst, projectId)).toEqual([]);
    expect(await listAssignableUsers(outsider, projectId)).toEqual([]);
  });
});
