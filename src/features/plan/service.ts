import type { Milestone, Prisma, Task, TaskKind, TaskStatus, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, canUpdateTaskProgress, getActor } from "@/lib/authz";
import { inUse, isForeignKeyError, naturalCompare, writing } from "@/lib/in-use";
import { fail, ok, type ActionResult } from "@/lib/result";
import { nextCode } from "@/lib/sequence";
import { parseInput } from "@/lib/validation";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const NO_TASK = "ไม่พบ Task";
const NO_MILESTONE = "ไม่พบ Milestone";
const PLAN_DATE_ORDER = "วันสิ้นสุดตามแผนต้องไม่ก่อนวันเริ่ม";
const ACTUAL_DATE_ORDER = "วันสิ้นสุดจริงต้องไม่ก่อนวันเริ่ม";
const PERCENT_RANGE = "ความคืบหน้า (%) ต้องเป็นจำนวนเต็ม 0-100";
const DAYS_STEP = "จำนวนวันต้องไม่ติดลบและเป็นทวีคูณของ 0.5";

export const TASK_STATUSES = ["TODO", "DOING", "DONE", "BLOCKED"] as const;
export const TASK_KINDS = ["PLAN", "DEV", "FIX", "REVIEW"] as const;

// ---------- views ----------

export type MilestoneView = {
  id: string;
  code: string;
  name: string;
  plannedDate: Date | null;
  revisedDate: Date | null;
  actualDate: Date | null;
};

export type TaskRow = {
  id: string;
  code: string;
  wbsCode: string | null;
  parentId: string | null;
  depth: number;
  title: string;
  kind: TaskKind;
  assigneeId: string | null;
  assigneeName: string | null;
  milestoneId: string | null;
  milestoneCode: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  status: TaskStatus;
  percent: number;
};

export type TaskDetail = TaskRow & {
  isoActivity: string | null;
  qaType: string | null;
  plannedDays: number | null;
  actualDays: number | null;
  outputWp: string | null;
  note: string | null;
  parent: { code: string; title: string } | null;
  children: { code: string; title: string }[];
  milestone: { code: string; name: string } | null;
  requirements: { id: string; code: string; text: string }[];
  components: { id: string; code: string; name: string }[];
};

export type MyTask = {
  projectCode: string;
  projectName: string;
  taskCode: string;
  title: string;
  plannedEnd: Date | null;
  status: TaskStatus;
};

export type PlanFilter = { status?: TaskStatus; assigneeId?: string; kind?: TaskKind };

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
const optDate = z
  .date()
  .nullish()
  .transform((v) => v ?? null);
const daysSchema = z.number(DAYS_STEP).min(0, DAYS_STEP).refine((v) => Number.isInteger(v * 2), DAYS_STEP);
const percentSchema = z.number(PERCENT_RANGE).int(PERCENT_RANGE).min(0, PERCENT_RANGE).max(100, PERCENT_RANGE);
const statusSchema = z.enum(TASK_STATUSES, { error: "สถานะไม่ถูกต้อง" });
const kindSchema = z.enum(TASK_KINDS, { error: "ชนิดงานไม่ถูกต้อง" });

const milestoneSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกชื่อ Milestone"),
  plannedDate: z.date({ error: "กรุณาระบุวันตามแผน" }),
  revisedDate: optDate,
  actualDate: optDate,
});

/** Progress fields: undefined = leave unchanged, null = clear. */
const progressFields = {
  status: statusSchema.optional(),
  percent: percentSchema.optional(),
  actualStart: z.date().nullable().optional(),
  actualEnd: z.date().nullable().optional(),
  actualDays: daysSchema.nullable().optional(),
};

const progressSchema = z.object(progressFields);

/** Planning fields replace the stored values (absent = cleared); kind and progress fields are left alone when absent. */
const taskSchema = z.object({
  title: z.string().trim().min(1, "กรุณากรอกชื่องาน"),
  kind: kindSchema.optional(),
  wbsCode: optStr,
  parentId: optId,
  isoActivity: optStr,
  qaType: optStr,
  assigneeId: optId,
  milestoneId: optId,
  plannedStart: optDate,
  plannedEnd: optDate,
  plannedDays: daysSchema.nullish().transform((v) => v ?? null),
  outputWp: optStr,
  note: optStr,
  ...progressFields,
});

export type MilestoneInput = z.input<typeof milestoneSchema>;
export type TaskInput = z.input<typeof taskSchema>;
export type TaskProgressInput = z.input<typeof progressSchema>;

const orderOk = (start: Date | null | undefined, end: Date | null | undefined) => !start || !end || end >= start;
const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

// ---------- milestones ----------

export async function createMilestone(
  user: User,
  projectId: string,
  input: MilestoneInput,
): Promise<ActionResult<Milestone>> {
  if (!can(await getActor(user, projectId), "plan.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(milestoneSchema, input);
  if (!parsed.ok) return parsed;
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, projectId, "M");
      return tx.milestone.create({ data: { projectId, code, ...parsed.data } });
    }),
  );
}

export async function updateMilestone(
  user: User,
  milestoneId: string,
  input: MilestoneInput,
): Promise<ActionResult<Milestone>> {
  const m = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
  if (!m) return fail(NO_MILESTONE);
  if (!can(await getActor(user, m.projectId), "plan.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(milestoneSchema, input);
  if (!parsed.ok) return parsed;
  return writing(() => prisma.milestone.update({ where: { id: milestoneId }, data: parsed.data }));
}

export async function deleteMilestone(user: User, milestoneId: string): Promise<ActionResult<null>> {
  const m = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
  if (!m) return fail(NO_MILESTONE);
  if (!can(await getActor(user, m.projectId), "plan.manage")) return fail(FORBIDDEN);
  const tasks = await prisma.task.findMany({ where: { milestoneId }, select: { code: true } });
  if (tasks.length > 0) return inUse(tasks.map((t) => t.code));
  try {
    await prisma.milestone.delete({ where: { id: milestoneId } });
  } catch (e) {
    if (isForeignKeyError(e)) return inUse([]);
    throw e;
  }
  return ok(null);
}

// ---------- tasks ----------

/** Parent, milestone and assignee must belong to the task's project; the parent must not be the task or its descendant. */
async function checkRefs(
  projectId: string,
  refs: { parentId: string | null; milestoneId: string | null; assigneeId: string | null },
  current?: { id: string; assigneeId: string | null },
): Promise<ActionResult<null>> {
  if (refs.parentId) {
    const parent = await prisma.task.findUnique({ where: { id: refs.parentId }, select: { projectId: true } });
    if (!parent || parent.projectId !== projectId) return fail("ไม่พบ Task แม่ในโครงการนี้");
    if (current) {
      const seen = new Set<string>();
      let cursor: string | null = refs.parentId;
      while (cursor && !seen.has(cursor)) {
        if (cursor === current.id) return fail("Task แม่ต้องไม่เป็นตัวเองหรือเป็นลูกหลานของตัวเอง");
        seen.add(cursor);
        cursor = (await prisma.task.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null;
      }
    }
  }
  if (refs.milestoneId) {
    const ms = await prisma.milestone.findUnique({ where: { id: refs.milestoneId }, select: { projectId: true } });
    if (!ms || ms.projectId !== projectId) return fail("ไม่พบ Milestone ในโครงการนี้");
  }
  if (refs.assigneeId && refs.assigneeId !== current?.assigneeId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: refs.assigneeId } },
      select: { id: true },
    });
    if (!member) return fail("ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ");
  }
  return ok(null);
}

type ProgressData = Pick<z.output<typeof progressSchema>, "status" | "percent" | "actualStart" | "actualEnd" | "actualDays">;

/** DONE means 100 %, whichever of status/percent was sent. */
function withDonePercent(data: ProgressData, storedStatus: TaskStatus | null): ProgressData {
  const status = data.status ?? storedStatus;
  return status === "DONE" ? { ...data, percent: 100 } : data;
}

export async function createTask(user: User, projectId: string, input: TaskInput): Promise<ActionResult<Task>> {
  if (!can(await getActor(user, projectId), "plan.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(taskSchema, input);
  if (!parsed.ok) return parsed;
  const data = withDonePercent(parsed.data, null);
  const p = parsed.data;
  if (!orderOk(p.plannedStart, p.plannedEnd)) return fail(PLAN_DATE_ORDER);
  if (!orderOk(p.actualStart, p.actualEnd)) return fail(ACTUAL_DATE_ORDER);
  const refs = await checkRefs(projectId, p);
  if (!refs.ok) return refs;
  const { parentId, milestoneId, assigneeId, ...rest } = { ...p, ...data };
  return writing(() =>
    prisma.$transaction(async (tx) => {
      const code = await nextCode(tx, projectId, "T");
      return tx.task.create({
        data: {
          ...rest,
          projectId,
          code,
          parentId,
          milestoneId,
          assigneeId,
        },
      });
    }),
  );
}

export async function updateTask(user: User, taskId: string, input: TaskInput): Promise<ActionResult<Task>> {
  const stored = await prisma.task.findUnique({ where: { id: taskId } });
  if (!stored) return fail(NO_TASK);
  if (!can(await getActor(user, stored.projectId), "plan.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(taskSchema, input);
  if (!parsed.ok) return parsed;
  const p = parsed.data;
  const merged = {
    actualStart: p.actualStart === undefined ? stored.actualStart : p.actualStart,
    actualEnd: p.actualEnd === undefined ? stored.actualEnd : p.actualEnd,
  };
  if (!orderOk(p.plannedStart, p.plannedEnd)) return fail(PLAN_DATE_ORDER);
  if (!orderOk(merged.actualStart, merged.actualEnd)) return fail(ACTUAL_DATE_ORDER);
  const refs = await checkRefs(stored.projectId, p, { id: stored.id, assigneeId: stored.assigneeId });
  if (!refs.ok) return refs;
  const data = withDonePercent(p, stored.status);
  return writing(() => prisma.task.update({ where: { id: taskId }, data: { ...p, ...data } }));
}

/** Progress fields only: for the assignee (and PM/ADMIN). Anything else in `input` is dropped by the schema. */
export async function updateTaskProgress(
  user: User,
  taskId: string,
  input: TaskProgressInput,
): Promise<ActionResult<Task>> {
  const stored = await prisma.task.findUnique({ where: { id: taskId } });
  if (!stored) return fail(NO_TASK);
  if (!canUpdateTaskProgress(await getActor(user, stored.projectId), stored)) return fail(FORBIDDEN);
  const parsed = parseInput(progressSchema, input);
  if (!parsed.ok) return parsed;
  const p = parsed.data;
  const start = p.actualStart === undefined ? stored.actualStart : p.actualStart;
  const end = p.actualEnd === undefined ? stored.actualEnd : p.actualEnd;
  if (!orderOk(start, end)) return fail(ACTUAL_DATE_ORDER);
  return writing(() => prisma.task.update({ where: { id: taskId }, data: withDonePercent(p, stored.status) }));
}

export async function deleteTask(user: User, taskId: string): Promise<ActionResult<null>> {
  const stored = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      projectId: true,
      children: { select: { code: true } },
      requirements: { select: { requirement: { select: { code: true } } } },
      components: { select: { component: { select: { code: true } } } },
      meetingItems: { select: { meeting: { select: { code: true } } } },
    },
  });
  if (!stored) return fail(NO_TASK);
  if (!can(await getActor(user, stored.projectId), "plan.manage")) return fail(FORBIDDEN);
  const refs = [
    ...stored.children.map((c) => c.code),
    ...stored.requirements.map((r) => r.requirement.code),
    ...stored.components.map((c) => c.component.code),
    ...new Set(stored.meetingItems.map((i) => i.meeting.code)),
  ];
  if (refs.length > 0) return inUse(refs);
  try {
    await prisma.task.delete({ where: { id: taskId } });
  } catch (e) {
    if (isForeignKeyError(e)) return inUse([]);
    throw e;
  }
  return ok(null);
}

// ---------- reads ----------

/** Compare WBS codes by numeric segments (2.9 before 2.10); tasks without a WBS code go last, by task code. */
function compareWbs(a: { wbsCode: string | null; code: string }, b: { wbsCode: string | null; code: string }): number {
  if (a.wbsCode === null || b.wbsCode === null) {
    if (a.wbsCode === b.wbsCode) return naturalCompare(a.code, b.code);
    return a.wbsCode === null ? 1 : -1;
  }
  const as = a.wbsCode.split(".");
  const bs = b.wbsCode.split(".");
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const x = Number(as[i]);
    const y = Number(bs[i]);
    const c = Number.isNaN(x) || Number.isNaN(y) ? naturalCompare(as[i], bs[i]) : x - y;
    if (c !== 0) return c;
  }
  return as.length - bs.length || naturalCompare(a.code, b.code);
}

const taskInclude = {
  assignee: { select: { fullName: true } },
  milestone: { select: { code: true, name: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRefs = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function toRow(t: TaskWithRefs, depth: number): TaskRow {
  return {
    id: t.id,
    code: t.code,
    wbsCode: t.wbsCode,
    parentId: t.parentId,
    depth,
    title: t.title,
    kind: t.kind,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.fullName ?? null,
    milestoneId: t.milestoneId,
    milestoneCode: t.milestone?.code ?? null,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    actualStart: t.actualStart,
    actualEnd: t.actualEnd,
    status: t.status,
    percent: t.percent,
  };
}

export async function listPlan(
  user: User,
  projectId: string,
  filter: PlanFilter = {},
): Promise<{ milestones: MilestoneView[]; tasks: TaskRow[] }> {
  if (!can(await getActor(user, projectId), "project.view")) return { milestones: [], tasks: [] };
  const [milestones, all] = await Promise.all([
    prisma.milestone.findMany({ where: { projectId } }),
    prisma.task.findMany({ where: { projectId }, include: taskInclude }),
  ]);
  const byId = new Map(all.map((t) => [t.id, t]));
  const depthOf = (t: TaskWithRefs): number => {
    let depth = 0;
    const seen = new Set([t.id]);
    let cursor = t.parentId ? byId.get(t.parentId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      depth += 1;
      seen.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return depth;
  };
  const tasks = all
    .filter(
      (t) =>
        (!filter.status || t.status === filter.status) &&
        (!filter.assigneeId || t.assigneeId === filter.assigneeId) &&
        (!filter.kind || t.kind === filter.kind),
    )
    .map((t) => toRow(t, depthOf(t)))
    .sort(compareWbs);
  return {
    milestones: milestones
      .map(({ id, code, name, plannedDate, revisedDate, actualDate }) => ({
        id,
        code,
        name,
        plannedDate,
        revisedDate,
        actualDate,
      }))
      .sort((a, b) => naturalCompare(a.code, b.code)),
    tasks,
  };
}

export async function getTask(user: User, projectId: string, taskCode: string): Promise<TaskDetail | null> {
  if (!can(await getActor(user, projectId), "project.view")) return null;
  const t = await prisma.task.findUnique({
    where: { projectId_code: { projectId, code: taskCode } },
    include: {
      ...taskInclude,
      parent: { select: { code: true, title: true } },
      children: { select: { code: true, title: true } },
      requirements: { select: { requirement: { select: { id: true, code: true, text: true } } } },
      components: { select: { component: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!t) return null;
  const depth = await taskDepth(t.parentId);
  return {
    ...toRow(t, depth),
    isoActivity: t.isoActivity,
    qaType: t.qaType,
    plannedDays: num(t.plannedDays),
    actualDays: num(t.actualDays),
    outputWp: t.outputWp,
    note: t.note,
    parent: t.parent,
    children: [...t.children].sort((a, b) => naturalCompare(a.code, b.code)),
    milestone: t.milestone,
    requirements: t.requirements.map((r) => r.requirement).sort((a, b) => naturalCompare(a.code, b.code)),
    components: t.components.map((c) => c.component).sort((a, b) => naturalCompare(a.code, b.code)),
  };
}

async function taskDepth(parentId: string | null): Promise<number> {
  let depth = 0;
  const seen = new Set<string>();
  let cursor = parentId;
  while (cursor && !seen.has(cursor)) {
    depth += 1;
    seen.add(cursor);
    cursor = (await prisma.task.findUnique({ where: { id: cursor }, select: { parentId: true } }))?.parentId ?? null;
  }
  return depth;
}

/** The caller's own tasks that are not DONE, across the projects they can see; soonest due first. */
export async function listMyOpenTasks(user: User): Promise<MyTask[]> {
  const rows = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      status: { not: "DONE" },
      ...(user.systemRole === "ADMIN" ? {} : { project: { members: { some: { userId: user.id } } } }),
    },
    include: { project: { select: { code: true, name: true } } },
    orderBy: [{ plannedEnd: { sort: "asc", nulls: "last" } }, { code: "asc" }],
  });
  return rows.map((t) => ({
    projectCode: t.project.code,
    projectName: t.project.name,
    taskCode: t.code,
    title: t.title,
    plannedEnd: t.plannedEnd,
    status: t.status,
  }));
}
