import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProjectRole, SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createProject } from "@/features/projects/service";
import { createTask, deleteTask } from "@/features/plan/service";
import {
  createAgreementItem,
  createComponent,
  createRequirement,
  deleteAgreementItem,
  deleteComponent,
  deleteRequirement,
  getComponent,
  getRequirement,
  listAgreementItems,
  listComponents,
  listRequirements,
  setRequirementComponents,
  setComponentLinks,
  setRequirementStatus,
  setTaskComponents,
  setTaskLinks,
  setTaskRequirements,
  updateAgreementItem,
  updateComponent,
  updateRequirement,
} from "@/features/trace/service";

const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };

let n = 0;
const mkUser = (systemRole: SystemRole = "USER") => {
  n += 1;
  return prisma.user.create({ data: { username: `t${n}`, passwordHash: "x", fullName: `User ${n}`, systemRole } });
};
async function join(projectId: string, user: User, roles: ProjectRole[]) {
  await prisma.projectMember.create({ data: { projectId, userId: user.id, roles, primaryRole: roles[0] } });
}

let admin: User, pm: User, tl: User, an: User, pr: User, qa: User, viewer: User, outsider: User, pmB: User, anB: User;
let pid: string, pidB: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
const ag = async (u = an, p = pid) => must(await createAgreementItem(u, p, { text: "ขอบเขต" }));
const req = async (extra: Record<string, unknown> = {}, u = an, p = pid) =>
  must(await createRequirement(u, p, { type: "FUNCTIONAL", text: "ระบบต้อง…", ...extra }));
const comp = async (extra: Record<string, unknown> = {}, u = an, p = pid) =>
  must(await createComponent(u, p, { name: "โมดูล", ...extra }));
const task = async (p = pid, u = pm) => must(await createTask(u, p, { title: "งาน" }));

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  [pm, tl, an, pr, qa, viewer, outsider, pmB, anB] = await Promise.all(Array.from({ length: 9 }, () => mkUser()));
  const a = must(await createProject(admin, { code: "TR-A", name: "A", pmUserId: pm.id }));
  const b = must(await createProject(admin, { code: "TR-B", name: "B", pmUserId: pmB.id }));
  pid = a.id;
  pidB = b.id;
  await join(pid, tl, ["TL"]);
  await join(pid, an, ["AN"]);
  await join(pid, pr, ["PR"]);
  await join(pid, qa, ["QA"]);
  await join(pid, viewer, ["VIEWER"]);
  await join(pidB, anB, ["AN"]);
});

describe("agreement items", () => {
  test("codes AG-01.., AN and TL manage, others do not", async () => {
    expect((await ag()).code).toBe("AG-01");
    expect((await ag(tl)).code).toBe("AG-02");
    for (const u of [pm, pr, qa, viewer, outsider, anB]) {
      expect(await createAgreementItem(u, pid, { text: "x" })).toEqual(denied);
    }
    expect(await createAgreementItem(admin, pid, { text: "x" })).toMatchObject({ ok: true });
    expect(await createAgreementItem(an, pid, { text: " " })).toEqual({ ok: false, error: "กรุณากรอกรายละเอียด" });
  });

  test("update, list and cross-project refusal", async () => {
    const a = await ag();
    expect(await updateAgreementItem(an, a.id, { text: "ใหม่" })).toMatchObject({ ok: true });
    expect(await updateAgreementItem(anB, a.id, { text: "x" })).toEqual(denied);
    expect(await updateAgreementItem(pm, a.id, { text: "x" })).toEqual(denied);
    expect((await listAgreementItems(viewer, pid)).map((x) => [x.code, x.text])).toEqual([["AG-01", "ใหม่"]]);
    expect(await listAgreementItems(outsider, pid)).toEqual([]);
    expect(await listAgreementItems(anB, pid)).toEqual([]);
  });

  test("delete blocked while requirements reference it", async () => {
    const a = await ag();
    await req({ agreementItemId: a.id });
    await req({ agreementItemId: a.id, type: "NON_FUNCTIONAL" });
    expect(await deleteAgreementItem(an, a.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก REQ-F01, REQ-N01" });
    await prisma.requirement.deleteMany({ where: { projectId: pid } });
    expect(await deleteAgreementItem(an, a.id)).toMatchObject({ ok: true });
    expect((await ag()).code).toBe("AG-02");
  });
});

describe("requirements", () => {
  test("separate counters per type; type cannot change", async () => {
    const f1 = await req();
    const n1 = await req({ type: "NON_FUNCTIONAL" });
    const f2 = await req();
    expect([f1.code, n1.code, f2.code]).toEqual(["REQ-F01", "REQ-N01", "REQ-F02"]);
    const u = await updateRequirement(an, f1.id, { text: "ใหม่", type: "NON_FUNCTIONAL" } as never);
    expect(u).toMatchObject({ ok: true });
    const row = await prisma.requirement.findUniqueOrThrow({ where: { id: f1.id } });
    expect(row).toMatchObject({ type: "FUNCTIONAL", text: "ใหม่", code: "REQ-F01", status: "PROPOSED" });
  });

  test("AN/TL manage; PM/PR/QA/VIEWER do not", async () => {
    expect(await createRequirement(tl, pid, { type: "FUNCTIONAL", text: "x" })).toMatchObject({ ok: true });
    for (const u of [pm, pr, qa, viewer, outsider, anB]) {
      expect(await createRequirement(u, pid, { type: "FUNCTIONAL", text: "x" })).toEqual(denied);
    }
    const r = await req();
    expect(await updateRequirement(pm, r.id, { text: "x" })).toEqual(denied);
    expect(await deleteRequirement(pr, r.id)).toEqual(denied);
  });

  test("validation: text and type", async () => {
    expect(await createRequirement(an, pid, { type: "FUNCTIONAL", text: "" })).toEqual({ ok: false, error: "กรุณากรอกรายละเอียด" });
    expect(await createRequirement(an, pid, { type: "OTHER" as never, text: "x" })).toEqual({ ok: false, error: "ประเภท Requirement ไม่ถูกต้อง" });
  });

  test("agreementItemId must be in the same project (create and update)", async () => {
    const agB = await ag(anB, pidB);
    expect(await createRequirement(an, pid, { type: "FUNCTIONAL", text: "x", agreementItemId: agB.id })).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    const r = await req();
    expect(await updateRequirement(an, r.id, { text: "x", agreementItemId: agB.id })).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    const own = await ag();
    expect(await updateRequirement(an, r.id, { text: "x", agreementItemId: own.id })).toMatchObject({ ok: true });
  });

  test("approve: TL and PM only; AN can drop but not approve or leave APPROVED", async () => {
    const r = await req();
    expect(await setRequirementStatus(an, r.id, "APPROVED")).toEqual(denied);
    expect(await setRequirementStatus(qa, r.id, "DROPPED")).toEqual(denied);
    expect(await setRequirementStatus(tl, r.id, "APPROVED")).toMatchObject({ ok: true });
    expect(await setRequirementStatus(an, r.id, "PROPOSED")).toEqual(denied);
    expect(await setRequirementStatus(pm, r.id, "PROPOSED")).toMatchObject({ ok: true });
    expect(await setRequirementStatus(pm, r.id, "APPROVED")).toMatchObject({ ok: true });
    expect(await setRequirementStatus(an, r.id, "DROPPED")).toEqual(denied);
    expect(await setRequirementStatus(pm, r.id, "PROPOSED")).toMatchObject({ ok: true });
    expect(await setRequirementStatus(an, r.id, "DROPPED")).toMatchObject({ ok: true });
    expect(await setRequirementStatus(anB, r.id, "PROPOSED")).toEqual(denied);
  });

  test("APPROVED text cannot be edited until status is changed back", async () => {
    const r = await req({ text: "เดิม" });
    await setRequirementStatus(tl, r.id, "APPROVED");
    expect(await updateRequirement(an, r.id, { text: "แก้" })).toEqual({ ok: false, error: "ข้อกำหนดที่อนุมัติแล้วแก้ไขรายละเอียดไม่ได้ ต้องเปลี่ยนสถานะกลับก่อน" });
    // unchanged text with another field changed is fine
    expect(await updateRequirement(an, r.id, { text: "เดิม", priority: "สูง" })).toMatchObject({ ok: true });
    await setRequirementStatus(tl, r.id, "PROPOSED");
    expect(await updateRequirement(an, r.id, { text: "แก้" })).toMatchObject({ ok: true });
  });

  test("delete blocked by tasks and components, naming them", async () => {
    const r = await req();
    const t = await task();
    const c = await comp();
    await setTaskRequirements(an, t.id, [r.id]);
    await setRequirementComponents(an, r.id, [c.id]);
    expect(await deleteRequirement(an, r.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก C01, T-001" });
    await setTaskRequirements(an, t.id, []);
    await setRequirementComponents(an, r.id, []);
    expect(await deleteRequirement(an, r.id)).toMatchObject({ ok: true });
  });

  test("list shows AG and status for members only", async () => {
    const a = await ag();
    await req({ agreementItemId: a.id, priority: "สูง" });
    const rows = await listRequirements(viewer, pid);
    expect(rows).toMatchObject([{ code: "REQ-F01", type: "FUNCTIONAL", priority: "สูง", status: "PROPOSED", agreement: { code: "AG-01" } }]);
    expect(await listRequirements(outsider, pid)).toEqual([]);
  });
});

describe("components", () => {
  test("codes C01.., AN/TL manage, owner must be a member", async () => {
    expect((await comp()).code).toBe("C01");
    expect((await comp({ ownerId: pr.id, unitTestStatus: "PASSED", version: "1.0" })).code).toBe("C02");
    expect(await createComponent(an, pid, { name: "x", ownerId: outsider.id })).toEqual({ ok: false, error: "ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ" });
    for (const u of [pm, pr, qa, viewer, outsider, anB]) expect(await createComponent(u, pid, { name: "x" })).toEqual(denied);
    expect(await createComponent(an, pid, { name: "" })).toEqual({ ok: false, error: "กรุณากรอกชื่อ Component" });
    expect(await createComponent(an, pid, { name: "x", unitTestStatus: "BAD" as never })).toEqual({ ok: false, error: "สถานะการทดสอบไม่ถูกต้อง" });
  });

  test("update keeps unit test status when absent; list", async () => {
    const c = await comp({ unitTestStatus: "FAILED" });
    expect(await updateComponent(an, c.id, { name: "ใหม่", description: "d" })).toMatchObject({ ok: true });
    expect(await updateComponent(pm, c.id, { name: "x" })).toEqual(denied);
    const rows = await listComponents(viewer, pid);
    expect(rows).toMatchObject([{ code: "C01", name: "ใหม่", description: "d", unitTestStatus: "FAILED", owner: null }]);
    expect(await updateComponent(an, c.id, { name: "x", unitTestStatus: "PASSED" })).toMatchObject({ ok: true });
    expect((await listComponents(viewer, pid))[0].unitTestStatus).toBe("PASSED");
  });

  test("delete blocked by tasks and requirements", async () => {
    const c = await comp();
    const t = await task();
    const r = await req();
    await setTaskComponents(an, t.id, [c.id]);
    await setRequirementComponents(an, r.id, [c.id]);
    expect(await deleteComponent(an, c.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก REQ-F01, T-001" });
    await setTaskComponents(an, t.id, []);
    await setRequirementComponents(an, r.id, []);
    expect(await deleteComponent(an, c.id)).toMatchObject({ ok: true });
    expect((await comp()).code).toBe("C02");
  });
});

describe("links", () => {
  test("replace-all, idempotent, join rows carry the project id", async () => {
    const t = await task();
    const r1 = await req();
    const r2 = await req();
    const c1 = await comp();
    expect(await setTaskRequirements(an, t.id, [r1.id, r2.id, r1.id])).toMatchObject({ ok: true });
    expect(await setTaskRequirements(an, t.id, [r1.id, r2.id])).toMatchObject({ ok: true });
    expect(await prisma.taskRequirement.findMany({ where: { taskId: t.id } })).toHaveLength(2);
    expect((await prisma.taskRequirement.findMany({ where: { taskId: t.id } })).every((l) => l.projectId === pid)).toBe(true);
    await setTaskRequirements(tl, t.id, [r2.id]);
    expect((await prisma.taskRequirement.findMany({ where: { taskId: t.id } })).map((l) => l.requirementId)).toEqual([r2.id]);
    await setTaskComponents(an, t.id, [c1.id]);
    await setRequirementComponents(an, r1.id, [c1.id]);
    expect((await prisma.taskComponent.findFirstOrThrow({ where: { taskId: t.id } })).projectId).toBe(pid);
    expect((await prisma.requirementComponent.findFirstOrThrow({ where: { requirementId: r1.id } })).projectId).toBe(pid);
    await setTaskRequirements(an, t.id, []);
    expect(await prisma.taskRequirement.count({ where: { taskId: t.id } })).toBe(0);
  });

  test("only AN/TL may link", async () => {
    const t = await task();
    const r = await req();
    const c = await comp();
    for (const u of [pm, pr, qa, viewer, outsider, anB]) {
      expect(await setTaskRequirements(u, t.id, [r.id])).toEqual(denied);
      expect(await setTaskComponents(u, t.id, [c.id])).toEqual(denied);
      expect(await setRequirementComponents(u, r.id, [c.id])).toEqual(denied);
    }
  });

  test("ids from another project are rejected by all three setters and nothing is written", async () => {
    const t = await task();
    const r = await req();
    const rB = await req({}, anB, pidB);
    const cB = await comp({}, anB, pidB);
    const own = await comp();
    expect(await setTaskRequirements(an, t.id, [rB.id])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    expect(await setTaskComponents(an, t.id, [cB.id])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    expect(await setRequirementComponents(an, r.id, [cB.id])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    expect(await setRequirementComponents(an, r.id, [own.id, cB.id])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    expect(await prisma.requirementComponent.count()).toBe(0);
    expect(await prisma.taskRequirement.count()).toBe(0);
    expect(await prisma.taskComponent.count()).toBe(0);
    expect(await setTaskRequirements(an, t.id, ["nope"])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    // and the owning item of another project cannot be reached either
    const tB = await task(pidB, pmB);
    expect(await setTaskRequirements(an, tB.id, [rB.id])).toEqual(denied);
  });

  test("a failed replace keeps the previous links", async () => {
    const t = await task();
    const r = await req();
    const rB = await req({}, anB, pidB);
    await setTaskRequirements(an, t.id, [r.id]);
    expect(await setTaskRequirements(an, t.id, [rB.id])).toEqual({ ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" });
    expect(await prisma.taskRequirement.count({ where: { taskId: t.id } })).toBe(1);
  });

  test("deleting a task with links is blocked (requirements and components named)", async () => {
    const t = await task();
    const r = await req();
    const c = await comp();
    await setTaskRequirements(an, t.id, [r.id]);
    await setTaskComponents(an, t.id, [c.id]);
    expect(await deleteTask(pm, t.id)).toEqual({ ok: false, error: "ลบไม่ได้: ถูกอ้างจาก C01, REQ-F01" });
    await setTaskRequirements(an, t.id, []);
    await setTaskComponents(an, t.id, []);
    expect(await deleteTask(pm, t.id)).toMatchObject({ ok: true });
  });
});

describe("combined link setters", () => {
  const NOT_IN_PROJECT = { ok: false, error: "ไม่พบรายการที่เลือกในโครงการนี้" };

  test("setTaskLinks writes both sets; an invalid component id leaves the requirement links unchanged", async () => {
    const t = await task();
    const r1 = await req();
    const r2 = await req();
    const c = await comp();
    const cB = await comp({}, anB, pidB);
    expect(await setTaskLinks(an, t.id, { requirementIds: [r1.id], componentIds: [c.id] })).toEqual({ ok: true, data: null });
    expect(await setTaskLinks(an, t.id, { requirementIds: [r1.id], componentIds: [c.id] })).toEqual({ ok: true, data: null });
    expect(await setTaskLinks(an, t.id, { requirementIds: [r2.id], componentIds: [cB.id] })).toEqual(NOT_IN_PROJECT);
    const reqs = await prisma.taskRequirement.findMany({ where: { taskId: t.id } });
    expect(reqs.map((x) => x.requirementId)).toEqual([r1.id]);
    expect(await prisma.taskComponent.count({ where: { taskId: t.id } })).toBe(1);
    expect(await setTaskLinks(an, t.id, { requirementIds: [], componentIds: [] })).toEqual({ ok: true, data: null });
    expect(await prisma.taskRequirement.count()).toBe(0);
  });

  test("setTaskLinks: only AN/TL, unknown task", async () => {
    const t = await task();
    for (const u of [pm, pr, qa, viewer, outsider, anB]) {
      expect(await setTaskLinks(u, t.id, { requirementIds: [], componentIds: [] })).toEqual(denied);
    }
    expect(await setTaskLinks(tl, t.id, { requirementIds: [], componentIds: [] })).toMatchObject({ ok: true });
    expect(await setTaskLinks(an, "nope", { requirementIds: [], componentIds: [] })).toEqual({ ok: false, error: "ไม่พบ Task" });
  });

  test("setComponentLinks sets requirements and tasks, rejects other projects and other roles, and is atomic", async () => {
    const c = await comp();
    const r = await req();
    const t = await task();
    const rB = await req({}, anB, pidB);
    const tB = await task(pidB, pmB);
    expect(await setComponentLinks(an, c.id, { requirementIds: [r.id], taskIds: [t.id] })).toEqual({ ok: true, data: null });
    expect(await prisma.requirementComponent.count({ where: { componentId: c.id } })).toBe(1);
    expect(await prisma.taskComponent.count({ where: { componentId: c.id } })).toBe(1);
    expect((await prisma.requirementComponent.findFirstOrThrow()).projectId).toBe(pid);
    expect(await setComponentLinks(an, c.id, { requirementIds: [], taskIds: [tB.id] })).toEqual(NOT_IN_PROJECT);
    expect(await setComponentLinks(an, c.id, { requirementIds: [rB.id], taskIds: [] })).toEqual(NOT_IN_PROJECT);
    expect(await prisma.requirementComponent.count({ where: { componentId: c.id } })).toBe(1);
    expect(await prisma.taskComponent.count({ where: { componentId: c.id } })).toBe(1);
    for (const u of [pm, pr, qa, viewer, outsider, anB]) {
      expect(await setComponentLinks(u, c.id, { requirementIds: [], taskIds: [] })).toEqual(denied);
    }
    expect(await setComponentLinks(an, "nope", { requirementIds: [], taskIds: [] })).toEqual({ ok: false, error: "ไม่พบ Component" });
    expect(await setComponentLinks(an, c.id, { requirementIds: [], taskIds: [] })).toEqual({ ok: true, data: null });
    expect(await prisma.taskComponent.count()).toBe(0);
  });

  test("a row deleted between the check and the write is reported, not thrown", async () => {
    const t = await task();
    const spy = vi.spyOn(prisma.requirement, "findMany").mockResolvedValueOnce([{ projectId: pid }] as never);
    try {
      expect(await setTaskRequirements(an, t.id, ["ghost"])).toEqual(NOT_IN_PROJECT);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("detail reads", () => {
  test("getRequirement: AG, tasks, components direct and via tasks, de-duplicated", async () => {
    const a = await ag();
    const r = await req({ agreementItemId: a.id });
    const t1 = await task();
    const t2 = await task();
    const c1 = await comp();
    const c2 = await comp();
    const c3 = await comp();
    await setTaskRequirements(an, t1.id, [r.id]);
    await setTaskRequirements(an, t2.id, [r.id]);
    await setTaskComponents(an, t1.id, [c1.id, c2.id]);
    await setTaskComponents(an, t2.id, [c2.id]);
    await setRequirementComponents(an, r.id, [c1.id, c3.id]);
    const d = await getRequirement(viewer, pid, "REQ-F01");
    expect(d).toMatchObject({
      code: "REQ-F01",
      agreementItem: { code: "AG-01" },
      tasks: [{ code: "T-001" }, { code: "T-002" }],
      components: [{ code: "C01" }, { code: "C02" }, { code: "C03" }],
    });
    expect(d?.directComponentIds.sort()).toEqual([c1.id, c3.id].sort());
    expect(await getRequirement(viewer, pid, "REQ-F99")).toBeNull();
    expect(await getRequirement(outsider, pid, "REQ-F01")).toBeNull();
    expect(await getRequirement(anB, pid, "REQ-F01")).toBeNull();
  });

  test("getComponent: tasks, requirements direct and via tasks, de-duplicated", async () => {
    const r1 = await req();
    const r2 = await req();
    const t = await task();
    const c = await comp({ ownerId: pr.id });
    await setTaskComponents(an, t.id, [c.id]);
    await setTaskRequirements(an, t.id, [r1.id, r2.id]);
    await setRequirementComponents(an, r1.id, [c.id]);
    const d = await getComponent(viewer, pid, "C01");
    expect(d).toMatchObject({ code: "C01", owner: { fullName: pr.fullName }, tasks: [{ code: "T-001" }], requirements: [{ code: "REQ-F01" }, { code: "REQ-F02" }] });
    expect(await getComponent(outsider, pid, "C01")).toBeNull();
    expect(await getComponent(viewer, pid, "C09")).toBeNull();
  });
});
