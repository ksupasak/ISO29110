import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { naturalCompare } from "@/lib/in-use";

export type Ref = { id: string; code: string; title: string };
export type Gap = "REQ_NO_AG" | "REQ_NO_TASK" | "REQ_NO_COMPONENT" | "AG_NO_REQ" | "DEV_TASK_NO_REQ";
export type TraceRow = {
  ag: Ref | null;
  requirement: Ref | null;
  tasks: Ref[];
  components: Ref[];
  gaps: Gap[];
};

const byCode = (a: { code: string }, b: { code: string }) => naturalCompare(a.code, b.code);

/**
 * Agreement item → Requirement → Task → Component, one row per requirement (DROPPED left out).
 * An agreement item without a live requirement gets a row of its own; requirements without an
 * agreement item come last. Components are the requirement's direct ones plus those of its tasks.
 * `DEV_TASK_NO_REQ` is reported through `orphanDevTasks`, because such a task is in no row.
 */
export async function buildTraceMatrix(
  user: User,
  projectId: string,
): Promise<{ rows: TraceRow[]; orphanDevTasks: Ref[] }> {
  if (!can(await getActor(user, projectId), "project.view")) return { rows: [], orphanDevTasks: [] };
  const componentSelect = { select: { component: { select: { id: true, code: true, name: true } } } } as const;
  const [agreements, requirements, orphans] = await Promise.all([
    prisma.agreementItem.findMany({ where: { projectId }, select: { id: true, code: true, text: true } }),
    prisma.requirement.findMany({
      where: { projectId, status: { not: "DROPPED" } },
      select: {
        id: true,
        code: true,
        text: true,
        agreementItemId: true,
        tasks: {
          select: { task: { select: { id: true, code: true, title: true, components: componentSelect } } },
        },
        components: componentSelect,
      },
    }),
    prisma.task.findMany({
      where: { projectId, kind: "DEV", requirements: { none: {} } },
      select: { id: true, code: true, title: true },
    }),
  ]);

  const agRef = new Map<string, Ref>(agreements.map((a) => [a.id, { id: a.id, code: a.code, title: a.text }]));
  const rowsFor = new Map<string | null, TraceRow[]>();
  const push = (key: string | null, row: TraceRow) => rowsFor.set(key, [...(rowsFor.get(key) ?? []), row]);

  for (const r of requirements) {
    const ag = r.agreementItemId ? (agRef.get(r.agreementItemId) ?? null) : null;
    const tasks = r.tasks.map((t) => ({ id: t.task.id, code: t.task.code, title: t.task.title })).sort(byCode);
    const comps = new Map<string, Ref>();
    for (const c of r.components) comps.set(c.component.id, { id: c.component.id, code: c.component.code, title: c.component.name });
    for (const t of r.tasks) {
      for (const c of t.task.components) comps.set(c.component.id, { id: c.component.id, code: c.component.code, title: c.component.name });
    }
    const components = [...comps.values()].sort(byCode);
    const gaps: Gap[] = [];
    if (!ag) gaps.push("REQ_NO_AG");
    if (tasks.length === 0) gaps.push("REQ_NO_TASK");
    if (components.length === 0) gaps.push("REQ_NO_COMPONENT");
    push(ag?.id ?? null, { ag, requirement: { id: r.id, code: r.code, title: r.text }, tasks, components, gaps });
  }

  const rows: TraceRow[] = [];
  for (const ag of [...agRef.values()].sort(byCode)) {
    const own = (rowsFor.get(ag.id) ?? []).sort((a, b) => byCode(a.requirement!, b.requirement!));
    if (own.length === 0) rows.push({ ag, requirement: null, tasks: [], components: [], gaps: ["AG_NO_REQ"] });
    else rows.push(...own);
  }
  rows.push(...(rowsFor.get(null) ?? []).sort((a, b) => byCode(a.requirement!, b.requirement!)));

  return { rows, orphanDevTasks: orphans.sort(byCode) };
}
