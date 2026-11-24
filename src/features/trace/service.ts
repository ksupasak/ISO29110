import type {
  AgreementItem,
  Component,
  Prisma,
  Requirement,
  RequirementStatus,
  RequirementType,
  UnitTestStatus,
  User,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { inUse, isForeignKeyError, naturalCompare, writing } from "@/lib/in-use";
import { fail, ok, type ActionResult } from "@/lib/result";
import { nextCode } from "@/lib/sequence";
import { parseInput } from "@/lib/validation";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const OTHER_PROJECT = "ไม่พบรายการที่เลือกในโครงการนี้";
const APPROVED_LOCKED = "ข้อกำหนดที่อนุมัติแล้วแก้ไขรายละเอียดไม่ได้ ต้องเปลี่ยนสถานะกลับก่อน";

export const REQUIREMENT_TYPES = ["FUNCTIONAL", "NON_FUNCTIONAL"] as const;
export const REQUIREMENT_STATUSES = ["PROPOSED", "APPROVED", "DROPPED"] as const;
export const UNIT_TEST_STATUSES = ["NOT_TESTED", "PASSED", "FAILED"] as const;

// ---------- views ----------

export type AgreementItemView = { id: string; code: string; text: string };
export type RequirementRow = {
  id: string;
  code: string;
  type: RequirementType;
  text: string;
  priority: string | null;
  designRef: string | null;
  status: RequirementStatus;
  agreementItemId: string | null;
  agreement: { id: string; code: string } | null;
};
export type ComponentRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  owner: { id: string; fullName: string } | null;
  unitTestStatus: UnitTestStatus;
  version: string | null;
};
export type TaskRef = { id: string; code: string; title: string };
export type RequirementDetail = RequirementRow & {
  agreementItem: { id: string; code: string; text: string } | null;
  tasks: TaskRef[];
  /** Linked directly or through one of the tasks, each once. */
  components: { id: string; code: string; name: string }[];
  directComponentIds: string[];
};
export type ComponentDetail = ComponentRow & {
  tasks: TaskRef[];
  /** Linked directly or through one of the tasks, each once. */
  requirements: { id: string; code: string; text: string }[];
  directRequirementIds: string[];
};

// ---------- schemas ----------

const optStr = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null);
const optId = z
  .string()
  .nullish()
  .transform((v) => v || null);

const agreementSchema = z.object({ text: z.string().trim().min(1, "กรุณากรอกรายละเอียด") });

const requirementFields = {
  text: z.string().trim().min(1, "กรุณากรอกรายละเอียด"),
  priority: optStr,
  agreementItemId: optId,
  designRef: optStr,
};
const createRequirementSchema = z.object({
  type: z.enum(REQUIREMENT_TYPES, { error: "ประเภท Requirement ไม่ถูกต้อง" }),
  ...requirementFields,
});
/** No `type`: it is fixed at creation because it is part of the code. */
const updateRequirementSchema = z.object(requirementFields);

const componentSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อ Component"),
  description: optStr,
  ownerId: optId,
  unitTestStatus: z.enum(UNIT_TEST_STATUSES, { error: "สถานะการทดสอบไม่ถูกต้อง" }).optional(),
  version: optStr,
});

export type AgreementItemInput = z.input<typeof agreementSchema>;
export type CreateRequirementInput = z.input<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.input<typeof updateRequirementSchema>;
export type ComponentInput = z.input<typeof componentSchema>;

// ---------- helpers ----------

async function canManage(user: User, projectId: string): Promise<boolean> {
  return can(await getActor(user, projectId), "trace.manage");
}

async function agreementInProject(projectId: string, id: string | null): Promise<boolean> {
  if (!id) return true;
  const row = await prisma.agreementItem.findUnique({ where: { id }, select: { projectId: true } });
  return row?.projectId === projectId;
}

async function ownerIsMember(projectId: string, userId: string | null): Promise<boolean> {
  if (!userId) return true;
  return !!(await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  }));
}

const unique = (ids: string[]) => [...new Set(ids)];
const byCode = <T extends { code: string }>(a: T, b: T) => naturalCompare(a.code, b.code);

// ---------- agreement items ----------

export async function createAgreementItem(
  user: User,
  projectId: string,
  input: AgreementItemInput,
): Promise<ActionResult<AgreementItem>> {
  if (!(await canManage(user, projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(agreementSchema, input);
  if (!parsed.ok) return parsed;
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, projectId, "AG");
      return tx.agreementItem.create({ data: { projectId, code, ...parsed.data } });
    }),
  );
}

export async function updateAgreementItem(
  user: User,
  id: string,
  input: AgreementItemInput,
): Promise<ActionResult<AgreementItem>> {
  const row = await prisma.agreementItem.findUnique({ where: { id }, select: { projectId: true } });
  if (!row) return fail("ไม่พบรายการขอบเขต");
  if (!(await canManage(user, row.projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(agreementSchema, input);
  if (!parsed.ok) return parsed;
  return writing(() => prisma.agreementItem.update({ where: { id }, data: parsed.data }));
}

export async function deleteAgreementItem(user: User, id: string): Promise<ActionResult<null>> {
  const row = await prisma.agreementItem.findUnique({ where: { id }, select: { projectId: true } });
  if (!row) return fail("ไม่พบรายการขอบเขต");
  if (!(await canManage(user, row.projectId))) return fail(FORBIDDEN);
  const refs = await prisma.requirement.findMany({ where: { agreementItemId: id }, select: { code: true } });
  if (refs.length > 0) return inUse(refs.map((r) => r.code));
  try {
    await prisma.agreementItem.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyError(e)) return inUse([]);
    throw e;
  }
  return ok(null);
}

export async function listAgreementItems(user: User, projectId: string): Promise<AgreementItemView[]> {
  if (!can(await getActor(user, projectId), "project.view")) return [];
  const rows = await prisma.agreementItem.findMany({ where: { projectId }, select: { id: true, code: true, text: true } });
  return rows.sort(byCode);
}

// ---------- requirements ----------

export async function createRequirement(
  user: User,
  projectId: string,
  input: CreateRequirementInput,
): Promise<ActionResult<Requirement>> {
  if (!(await canManage(user, projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(createRequirementSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await agreementInProject(projectId, parsed.data.agreementItemId))) return fail(OTHER_PROJECT);
  const prefix = parsed.data.type === "FUNCTIONAL" ? "REQ-F" : "REQ-N";
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, projectId, prefix);
      return tx.requirement.create({ data: { projectId, code, ...parsed.data } });
    }),
  );
}

export async function updateRequirement(
  user: User,
  id: string,
  input: UpdateRequirementInput,
): Promise<ActionResult<Requirement>> {
  const stored = await prisma.requirement.findUnique({ where: { id } });
  if (!stored) return fail("ไม่พบ Requirement");
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(updateRequirementSchema, input);
  if (!parsed.ok) return parsed;
  if (stored.status === "APPROVED" && parsed.data.text !== stored.text) return fail(APPROVED_LOCKED);
  if (!(await agreementInProject(stored.projectId, parsed.data.agreementItemId))) return fail(OTHER_PROJECT);
  return writing(() => prisma.requirement.update({ where: { id }, data: parsed.data }));
}

/**
 * Moving to or from APPROVED needs `requirement.approve` (TL, PM); PROPOSED and DROPPED
 * can be switched by anyone who manages requirements.
 */
export async function setRequirementStatus(
  user: User,
  id: string,
  status: RequirementStatus,
): Promise<ActionResult<Requirement>> {
  const stored = await prisma.requirement.findUnique({ where: { id }, select: { projectId: true, status: true } });
  if (!stored) return fail("ไม่พบ Requirement");
  if (!z.enum(REQUIREMENT_STATUSES).safeParse(status).success) return fail("สถานะไม่ถูกต้อง");
  const actor = await getActor(user, stored.projectId);
  const touchesApproved = status === "APPROVED" || stored.status === "APPROVED";
  const allowed = touchesApproved
    ? can(actor, "requirement.approve")
    : can(actor, "requirement.approve") || can(actor, "trace.manage");
  if (!allowed) return fail(FORBIDDEN);
  return writing(() => prisma.requirement.update({ where: { id }, data: { status } }));
}

export async function deleteRequirement(user: User, id: string): Promise<ActionResult<null>> {
  const stored = await prisma.requirement.findUnique({
    where: { id },
    select: {
      projectId: true,
      tasks: { select: { task: { select: { code: true } } } },
      components: { select: { component: { select: { code: true } } } },
    },
  });
  if (!stored) return fail("ไม่พบ Requirement");
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  const refs = [...stored.tasks.map((t) => t.task.code), ...stored.components.map((c) => c.component.code)];
  if (refs.length > 0) return inUse(refs);
  try {
    await prisma.requirement.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyError(e)) return inUse([]);
    throw e;
  }
  return ok(null);
}

export async function listRequirements(user: User, projectId: string): Promise<RequirementRow[]> {
  if (!can(await getActor(user, projectId), "project.view")) return [];
  const rows = await prisma.requirement.findMany({
    where: { projectId },
    include: { agreementItem: { select: { id: true, code: true } } },
  });
  return rows
    .map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      text: r.text,
      priority: r.priority,
      designRef: r.designRef,
      status: r.status,
      agreementItemId: r.agreementItemId,
      agreement: r.agreementItem,
    }))
    .sort(byCode);
}

export async function getRequirement(user: User, projectId: string, code: string): Promise<RequirementDetail | null> {
  if (!can(await getActor(user, projectId), "project.view")) return null;
  const r = await prisma.requirement.findUnique({
    where: { projectId_code: { projectId, code } },
    include: {
      agreementItem: { select: { id: true, code: true, text: true } },
      tasks: {
        select: {
          task: {
            select: {
              id: true,
              code: true,
              title: true,
              components: { select: { component: { select: { id: true, code: true, name: true } } } },
            },
          },
        },
      },
      components: { select: { component: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!r) return null;
  const components = new Map<string, { id: string; code: string; name: string }>();
  for (const c of r.components) components.set(c.component.id, c.component);
  for (const t of r.tasks) for (const c of t.task.components) components.set(c.component.id, c.component);
  return {
    id: r.id,
    code: r.code,
    type: r.type,
    text: r.text,
    priority: r.priority,
    designRef: r.designRef,
    status: r.status,
    agreementItemId: r.agreementItemId,
    agreement: r.agreementItem ? { id: r.agreementItem.id, code: r.agreementItem.code } : null,
    agreementItem: r.agreementItem,
    tasks: r.tasks.map((t) => ({ id: t.task.id, code: t.task.code, title: t.task.title })).sort(byCode),
    components: [...components.values()].sort(byCode),
    directComponentIds: r.components.map((c) => c.component.id),
  };
}

// ---------- components ----------

export async function createComponent(
  user: User,
  projectId: string,
  input: ComponentInput,
): Promise<ActionResult<Component>> {
  if (!(await canManage(user, projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(componentSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await ownerIsMember(projectId, parsed.data.ownerId))) return fail("ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ");
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, projectId, "C");
      return tx.component.create({ data: { projectId, code, ...parsed.data } });
    }),
  );
}

/** `unitTestStatus` absent = unchanged; the other fields replace the stored values. */
export async function updateComponent(
  user: User,
  id: string,
  input: ComponentInput,
): Promise<ActionResult<Component>> {
  const stored = await prisma.component.findUnique({ where: { id }, select: { projectId: true, ownerId: true } });
  if (!stored) return fail("ไม่พบ Component");
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(componentSchema, input);
  if (!parsed.ok) return parsed;
  if (parsed.data.ownerId !== stored.ownerId && !(await ownerIsMember(stored.projectId, parsed.data.ownerId))) {
    return fail("ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ");
  }
  return writing(() => prisma.component.update({ where: { id }, data: parsed.data }));
}

export async function deleteComponent(user: User, id: string): Promise<ActionResult<null>> {
  const stored = await prisma.component.findUnique({
    where: { id },
    select: {
      projectId: true,
      tasks: { select: { task: { select: { code: true } } } },
      requirements: { select: { requirement: { select: { code: true } } } },
    },
  });
  if (!stored) return fail("ไม่พบ Component");
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  const refs = [...stored.requirements.map((r) => r.requirement.code), ...stored.tasks.map((t) => t.task.code)];
  if (refs.length > 0) return inUse(refs);
  try {
    await prisma.component.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyError(e)) return inUse([]);
    throw e;
  }
  return ok(null);
}

const componentInclude = { owner: { select: { id: true, fullName: true } } } satisfies Prisma.ComponentInclude;

function toComponentRow(c: Prisma.ComponentGetPayload<{ include: typeof componentInclude }>): ComponentRow {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description,
    ownerId: c.ownerId,
    owner: c.owner,
    unitTestStatus: c.unitTestStatus,
    version: c.version,
  };
}

export async function listComponents(user: User, projectId: string): Promise<ComponentRow[]> {
  if (!can(await getActor(user, projectId), "project.view")) return [];
  const rows = await prisma.component.findMany({ where: { projectId }, include: componentInclude });
  return rows.map(toComponentRow).sort(byCode);
}

export async function getComponent(user: User, projectId: string, code: string): Promise<ComponentDetail | null> {
  if (!can(await getActor(user, projectId), "project.view")) return null;
  const c = await prisma.component.findUnique({
    where: { projectId_code: { projectId, code } },
    include: {
      ...componentInclude,
      tasks: {
        select: {
          task: {
            select: {
              id: true,
              code: true,
              title: true,
              requirements: { select: { requirement: { select: { id: true, code: true, text: true } } } },
            },
          },
        },
      },
      requirements: { select: { requirement: { select: { id: true, code: true, text: true } } } },
    },
  });
  if (!c) return null;
  const requirements = new Map<string, { id: string; code: string; text: string }>();
  for (const r of c.requirements) requirements.set(r.requirement.id, r.requirement);
  for (const t of c.tasks) for (const r of t.task.requirements) requirements.set(r.requirement.id, r.requirement);
  return {
    ...toComponentRow(c),
    tasks: c.tasks.map((t) => ({ id: t.task.id, code: t.task.code, title: t.task.title })).sort(byCode),
    requirements: [...requirements.values()].sort(byCode),
    directRequirementIds: c.requirements.map((r) => r.requirement.id),
  };
}

// ---------- links (replace-all) ----------

type Model = "requirement" | "component" | "task";

/** Every id must exist and belong to `projectId`. */
async function allInProject(model: Model, projectId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const where = { id: { in: ids } };
  const select = { projectId: true };
  const rows: { projectId: string }[] =
    model === "requirement"
      ? await prisma.requirement.findMany({ where, select })
      : model === "component"
        ? await prisma.component.findMany({ where, select })
        : await prisma.task.findMany({ where, select });
  return rows.length === ids.length && rows.every((r) => r.projectId === projectId);
}

/**
 * Replaces link sets of one owner. Ids of another project are rejected before anything is written; all sets are
 * written in one transaction, and the join rows always take the owner's project id.
 */
async function replaceLinks(
  user: User,
  owner: { projectId: string } | null,
  notFound: string,
  checks: { model: Model; ids: string[] }[],
  write: (tx: Prisma.TransactionClient, projectId: string) => Promise<unknown>,
): Promise<ActionResult<null>> {
  if (!owner) return fail(notFound);
  if (!(await canManage(user, owner.projectId))) return fail(FORBIDDEN);
  for (const c of checks) {
    if (!(await allInProject(c.model, owner.projectId, c.ids))) return fail(OTHER_PROJECT);
  }
  return writing(async () => {
    await prisma.$transaction((tx) => write(tx, owner.projectId));
    return null;
  });
}

export async function setTaskRequirements(user: User, taskId: string, requirementIds: string[]): Promise<ActionResult<null>> {
  return setTaskLinksInternal(user, taskId, { requirementIds });
}

export async function setTaskComponents(user: User, taskId: string, componentIds: string[]): Promise<ActionResult<null>> {
  return setTaskLinksInternal(user, taskId, { componentIds });
}

/** Both link sets of a task in one transaction: either both change or neither does. */
export async function setTaskLinks(
  user: User,
  taskId: string,
  input: { requirementIds: string[]; componentIds: string[] },
): Promise<ActionResult<null>> {
  return setTaskLinksInternal(user, taskId, input);
}

async function setTaskLinksInternal(
  user: User,
  taskId: string,
  input: { requirementIds?: string[]; componentIds?: string[] },
): Promise<ActionResult<null>> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  const requirementIds = input.requirementIds ? unique(input.requirementIds) : undefined;
  const componentIds = input.componentIds ? unique(input.componentIds) : undefined;
  return replaceLinks(
    user,
    task,
    "ไม่พบ Task",
    [
      { model: "requirement", ids: requirementIds ?? [] },
      { model: "component", ids: componentIds ?? [] },
    ],
    async (tx, projectId) => {
      if (requirementIds) {
        await tx.taskRequirement.deleteMany({ where: { taskId } });
        await tx.taskRequirement.createMany({ data: requirementIds.map((requirementId) => ({ taskId, requirementId, projectId })) });
      }
      if (componentIds) {
        await tx.taskComponent.deleteMany({ where: { taskId } });
        await tx.taskComponent.createMany({ data: componentIds.map((componentId) => ({ taskId, componentId, projectId })) });
      }
    },
  );
}

export async function setRequirementComponents(
  user: User,
  requirementId: string,
  componentIds: string[],
): Promise<ActionResult<null>> {
  const requirement = await prisma.requirement.findUnique({ where: { id: requirementId }, select: { projectId: true } });
  const wanted = unique(componentIds);
  return replaceLinks(
    user,
    requirement,
    "ไม่พบ Requirement",
    [{ model: "component", ids: wanted }],
    async (tx, projectId) => {
      await tx.requirementComponent.deleteMany({ where: { requirementId } });
      await tx.requirementComponent.createMany({
        data: wanted.map((componentId) => ({ requirementId, componentId, projectId })),
      });
    },
  );
}

/** The reverse direction, from a component page: the requirements and tasks that point at it, replaced together. */
export async function setComponentLinks(
  user: User,
  componentId: string,
  input: { requirementIds: string[]; taskIds: string[] },
): Promise<ActionResult<null>> {
  const component = await prisma.component.findUnique({ where: { id: componentId }, select: { projectId: true } });
  const requirementIds = unique(input.requirementIds);
  const taskIds = unique(input.taskIds);
  return replaceLinks(
    user,
    component,
    "ไม่พบ Component",
    [
      { model: "requirement", ids: requirementIds },
      { model: "task", ids: taskIds },
    ],
    async (tx, projectId) => {
      await tx.requirementComponent.deleteMany({ where: { componentId } });
      await tx.requirementComponent.createMany({
        data: requirementIds.map((requirementId) => ({ requirementId, componentId, projectId })),
      });
      await tx.taskComponent.deleteMany({ where: { componentId } });
      await tx.taskComponent.createMany({ data: taskIds.map((taskId) => ({ taskId, componentId, projectId })) });
    },
  );
}
