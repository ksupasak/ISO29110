import { beforeEach, describe, expect, test } from "vitest";
import type { ProjectRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createProject } from "@/features/projects/service";
import { createTask } from "@/features/plan/service";
import {
  createAgreementItem,
  createComponent,
  createRequirement,
  setRequirementComponents,
  setRequirementStatus,
  setTaskComponents,
  setTaskRequirements,
} from "@/features/trace/service";
import { buildTraceMatrix } from "@/features/trace/matrix";

let n = 0;
const mkUser = (systemRole: "USER" | "ADMIN" = "USER") => {
  n += 1;
  return prisma.user.create({ data: { username: `x${n}`, passwordHash: "x", fullName: `User ${n}`, systemRole } });
};
async function join(projectId: string, user: User, roles: ProjectRole[]) {
  await prisma.projectMember.create({ data: { projectId, userId: user.id, roles, primaryRole: roles[0] } });
}
function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

let admin: User, pm: User, tl: User, viewer: User, outsider: User, pmB: User;
let pid: string, pidB: string;

const ag = async (p = pid, u = tl) => must(await createAgreementItem(u, p, { text: "ขอบเขต" }));
const req = async (extra: Record<string, unknown> = {}, p = pid, u = tl) =>
  must(await createRequirement(u, p, { type: "FUNCTIONAL", text: "ข้อกำหนด", ...extra }));
const comp = async (p = pid, u = tl) => must(await createComponent(u, p, { name: "โมดูล" }));
const task = async (extra: Record<string, unknown> = {}, p = pid, u = pm) =>
  must(await createTask(u, p, { title: "งาน", ...extra }));
const codes = (refs: { code: string }[]) => refs.map((r) => r.code);

beforeEach(async () => {
  await resetDb();
  admin = await mkUser("ADMIN");
  [pm, tl, viewer, outsider, pmB] = await Promise.all(Array.from({ length: 5 }, () => mkUser()));
  pid = must(await createProject(admin, { code: "MX-A", name: "A", pmUserId: pm.id })).id;
  pidB = must(await createProject(admin, { code: "MX-B", name: "B", pmUserId: pmB.id })).id;
  await join(pid, tl, ["TL"]);
  await join(pid, viewer, ["VIEWER"]);
  await join(pidB, tl, ["TL"]);
});

describe("buildTraceMatrix", () => {
  test("a fully linked requirement has one row and no gaps", async () => {
    const a = await ag();
    const r = await req({ agreementItemId: a.id });
    const t = await task();
    const c = await comp();
    await setTaskRequirements(tl, t.id, [r.id]);
    await setTaskComponents(tl, t.id, [c.id]);
    const { rows, orphanDevTasks } = await buildTraceMatrix(viewer, pid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ag: { code: "AG-01" }, requirement: { code: "REQ-F01" }, gaps: [] });
    expect(codes(rows[0].tasks)).toEqual(["T-001"]);
    expect(codes(rows[0].components)).toEqual(["C01"]);
    expect(orphanDevTasks).toEqual([]);
  });

  test("gap REQ_NO_AG, REQ_NO_TASK, REQ_NO_COMPONENT", async () => {
    await req();
    const { rows } = await buildTraceMatrix(tl, pid);
    expect(rows).toHaveLength(1);
    expect(rows[0].ag).toBeNull();
    expect(rows[0].gaps).toEqual(["REQ_NO_AG", "REQ_NO_TASK", "REQ_NO_COMPONENT"]);
  });

  test("a task without components still leaves REQ_NO_COMPONENT; a direct link clears it", async () => {
    const a = await ag();
    const r = await req({ agreementItemId: a.id });
    const t = await task();
    await setTaskRequirements(tl, t.id, [r.id]);
    expect((await buildTraceMatrix(tl, pid)).rows[0].gaps).toEqual(["REQ_NO_COMPONENT"]);
    const c = await comp();
    await setRequirementComponents(tl, r.id, [c.id]);
    const row = (await buildTraceMatrix(tl, pid)).rows[0];
    expect(row.gaps).toEqual([]);
    expect(codes(row.components)).toEqual(["C01"]);
  });

  test("AG_NO_REQ: an AG without a requirement gets its own row", async () => {
    await ag();
    const { rows } = await buildTraceMatrix(tl, pid);
    expect(rows).toEqual([{ ag: expect.objectContaining({ code: "AG-01" }), requirement: null, tasks: [], components: [], gaps: ["AG_NO_REQ"] }]);
  });

  test("DROPPED requirements are excluded; an AG left with only dropped ones is AG_NO_REQ", async () => {
    const a = await ag();
    const r = await req({ agreementItemId: a.id });
    await setRequirementStatus(tl, r.id, "DROPPED");
    const { rows } = await buildTraceMatrix(tl, pid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requirement: null, gaps: ["AG_NO_REQ"] });
  });

  test("DEV tasks without a requirement are orphans; other kinds and linked DEV tasks are not", async () => {
    const r = await req();
    const dev1 = await task({ title: "orphan", kind: "DEV" }); // T-001
    await task({ title: "plan", kind: "PLAN" });
    await task({ title: "fix", kind: "FIX" });
    const linked = await task({ title: "linked", kind: "DEV" });
    await setTaskRequirements(tl, linked.id, [r.id]);
    const { orphanDevTasks } = await buildTraceMatrix(tl, pid);
    expect(orphanDevTasks).toEqual([{ id: dev1.id, code: "T-001", title: "orphan" }]);
  });

  test("ordering: by AG code then requirement code; unassigned requirements last; AG-only rows in place", async () => {
    const a1 = await ag(); // AG-01
    const a2 = await ag(); // AG-02
    await ag(); // AG-03 (no requirement)
    await req({ type: "NON_FUNCTIONAL", agreementItemId: a1.id }); // REQ-N01 -> AG-01
    await req({ agreementItemId: a2.id }); // REQ-F01 -> AG-02
    await req({ agreementItemId: a1.id }); // REQ-F02 -> AG-01
    await req(); // REQ-F03, no AG
    const { rows } = await buildTraceMatrix(tl, pid);
    expect(rows.map((r) => [r.ag?.code ?? null, r.requirement?.code ?? null])).toEqual([
      ["AG-01", "REQ-F02"],
      ["AG-01", "REQ-N01"],
      ["AG-02", "REQ-F01"],
      ["AG-03", null],
      [null, "REQ-F03"],
    ]);
  });

  test("tasks and components are de-duplicated and sorted; components = direct union via tasks", async () => {
    const a = await ag();
    const r = await req({ agreementItemId: a.id });
    const t1 = await task();
    const t2 = await task();
    const c1 = await comp();
    const c2 = await comp();
    const c3 = await comp();
    await setTaskRequirements(tl, t2.id, [r.id]);
    await setTaskRequirements(tl, t1.id, [r.id]);
    await setTaskComponents(tl, t1.id, [c2.id, c1.id]);
    await setTaskComponents(tl, t2.id, [c2.id]);
    await setRequirementComponents(tl, r.id, [c1.id, c3.id]);
    const row = (await buildTraceMatrix(tl, pid)).rows[0];
    expect(codes(row.tasks)).toEqual(["T-001", "T-002"]);
    expect(codes(row.components)).toEqual(["C01", "C02", "C03"]);
  });

  test("another project's items never appear and non-members get nothing", async () => {
    await req({}, pidB);
    await ag(pidB);
    await task({ kind: "DEV" }, pidB, pmB);
    expect(await buildTraceMatrix(tl, pid)).toEqual({ rows: [], orphanDevTasks: [] });
    expect((await buildTraceMatrix(tl, pidB)).rows).toHaveLength(2);
    expect(await buildTraceMatrix(outsider, pidB)).toEqual({ rows: [], orphanDevTasks: [] });
    expect(await buildTraceMatrix(pm, pidB)).toEqual({ rows: [], orphanDevTasks: [] });
  });
});
