import type { TaskDetail } from "@/features/plan/service";
import type { MilestoneView } from "@/features/plan/service";
import type { MilestoneFormValue, TaskFormValue } from "./plan-dialogs";

export const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function milestoneFormValue(m: MilestoneView): MilestoneFormValue {
  return {
    id: m.id,
    name: m.name,
    plannedDate: isoDate(m.plannedDate),
    revisedDate: isoDate(m.revisedDate),
    actualDate: isoDate(m.actualDate),
  };
}

export function taskFormValue(t: TaskDetail): TaskFormValue {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    wbsCode: t.wbsCode ?? "",
    parentId: t.parentId ?? "",
    isoActivity: t.isoActivity ?? "",
    qaType: t.qaType ?? "",
    assigneeId: t.assigneeId ?? "",
    milestoneId: t.milestoneId ?? "",
    plannedStart: isoDate(t.plannedStart),
    plannedEnd: isoDate(t.plannedEnd),
    plannedDays: t.plannedDays === null ? "" : String(t.plannedDays),
    outputWp: t.outputWp ?? "",
    note: t.note ?? "",
    status: t.status,
    percent: String(t.percent),
    actualStart: isoDate(t.actualStart),
    actualEnd: isoDate(t.actualEnd),
    actualDays: t.actualDays === null ? "" : String(t.actualDays),
  };
}
