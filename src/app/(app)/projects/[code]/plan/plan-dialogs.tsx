"use client";

import {
  createMilestoneAction,
  createTaskAction,
  updateMilestoneAction,
  updateTaskAction,
  updateTaskProgressAction,
} from "@/features/plan/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect, FloatingTextarea } from "@/components/form-fields";
import { TASK_KIND_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";

const KINDS = Object.keys(TASK_KIND_LABEL) as (keyof typeof TASK_KIND_LABEL)[];
const STATUSES = Object.keys(TASK_STATUS_LABEL) as (keyof typeof TASK_STATUS_LABEL)[];

export type MilestoneFormValue = {
  id: string;
  name: string;
  plannedDate: string;
  revisedDate: string;
  actualDate: string;
};

export type TaskFormValue = {
  id: string;
  title: string;
  kind: string;
  wbsCode: string;
  parentId: string;
  isoActivity: string;
  qaType: string;
  assigneeId: string;
  milestoneId: string;
  plannedStart: string;
  plannedEnd: string;
  plannedDays: string;
  outputWp: string;
  note: string;
  status: string;
  percent: string;
  actualStart: string;
  actualEnd: string;
  actualDays: string;
};

type Option = { id: string; label: string };

export function MilestoneDialog({ projectId, milestone }: { projectId: string; milestone?: MilestoneFormValue }) {
  return (
    <FormDialog
      title={milestone ? `แก้ไข ${milestone.name}` : "เพิ่ม Milestone"}
      trigger={milestone ? "แก้ไข" : "เพิ่ม Milestone"}
      triggerIcon={milestone ? "edit" : "flag"}
      iconOnly={!!milestone}
      action={milestone ? updateMilestoneAction : createMilestoneAction}
    >
      {(v) => (
        <>
          {milestone ? <input type="hidden" name="milestoneId" value={milestone.id} /> : <input type="hidden" name="projectId" value={projectId} />}
          <FloatingField id="name" label="ชื่อ Milestone" required defaultValue={v.name ?? milestone?.name ?? ""} />
          <FloatingField id="plannedDate" label="วันตามแผน" type="date" required defaultValue={v.plannedDate ?? milestone?.plannedDate ?? ""} />
          <FloatingField id="revisedDate" label="วันปรับแผน" type="date" defaultValue={v.revisedDate ?? milestone?.revisedDate ?? ""} />
          <FloatingField id="actualDate" label="วันจริง" type="date" defaultValue={v.actualDate ?? milestone?.actualDate ?? ""} />
        </>
      )}
    </FormDialog>
  );
}

function Opt({ options, empty }: { options: Option[]; empty: string }) {
  return (
    <>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </>
  );
}

/** Progress fields shared by the PM's edit dialog and the assignee's progress dialog. */
function ProgressFields({ v, task }: { v: Record<string, string>; task?: TaskFormValue }) {
  const val = (k: keyof TaskFormValue) => v[k] ?? task?.[k] ?? "";
  return (
    <>
      <FloatingSelect key={`status-${v.status ?? ""}`} id="status" label="สถานะ" defaultValue={val("status") || "TODO"}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
        ))}
      </FloatingSelect>
      <FloatingField id="percent" label="ความคืบหน้า (%)" type="number" min="0" max="100" step="1" defaultValue={val("percent")} />
      <div className="row g-2">
        <div className="col-sm-6"><FloatingField id="actualStart" label="วันเริ่มจริง" type="date" defaultValue={val("actualStart")} /></div>
        <div className="col-sm-6"><FloatingField id="actualEnd" label="วันเสร็จจริง" type="date" defaultValue={val("actualEnd")} /></div>
      </div>
      <FloatingField id="actualDays" label="จำนวนวันจริง" type="number" min="0" step="0.5" defaultValue={val("actualDays")} />
    </>
  );
}

export function TaskDialog({
  projectId,
  task,
  members,
  milestones,
  parents,
}: {
  projectId: string;
  task?: TaskFormValue;
  members: Option[];
  milestones: Option[];
  parents: Option[];
}) {
  return (
    <FormDialog
      title={task ? "แก้ไข Task" : "เพิ่ม Task"}
      trigger={task ? "แก้ไข" : "เพิ่ม Task"}
      triggerIcon={task ? "edit" : "add_task"}
      action={task ? updateTaskAction : createTaskAction}
    >
      {(v) => {
        const val = (k: keyof TaskFormValue) => v[k] ?? task?.[k] ?? "";
        return (
          <>
            {task ? <input type="hidden" name="taskId" value={task.id} /> : <input type="hidden" name="projectId" value={projectId} />}
            <FloatingField id="title" label="ชื่องาน" required defaultValue={val("title")} />
            <div className="row g-2">
              <div className="col-sm-6">
                <FloatingSelect key={`kind-${v.kind ?? ""}`} id="kind" label="ชนิด" defaultValue={val("kind") || "DEV"}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>
                  ))}
                </FloatingSelect>
              </div>
              <div className="col-sm-6"><FloatingField id="wbsCode" label="WBS" defaultValue={val("wbsCode")} /></div>
            </div>
            <FloatingSelect key={`parent-${v.parentId ?? ""}`} id="parentId" label="Task แม่" defaultValue={val("parentId")}>
              <Opt options={parents.filter((p) => p.id !== task?.id)} empty="ไม่มี" />
            </FloatingSelect>
            <FloatingSelect key={`assignee-${v.assigneeId ?? ""}`} id="assigneeId" label="ผู้รับผิดชอบ" defaultValue={val("assigneeId")}>
              <Opt options={members} empty="ยังไม่ระบุ" />
            </FloatingSelect>
            <FloatingSelect key={`ms-${v.milestoneId ?? ""}`} id="milestoneId" label="Milestone" defaultValue={val("milestoneId")}>
              <Opt options={milestones} empty="ไม่มี" />
            </FloatingSelect>
            <div className="row g-2">
              <div className="col-sm-6"><FloatingField id="plannedStart" label="วันเริ่มตามแผน" type="date" defaultValue={val("plannedStart")} /></div>
              <div className="col-sm-6"><FloatingField id="plannedEnd" label="วันเสร็จตามแผน" type="date" defaultValue={val("plannedEnd")} /></div>
            </div>
            <FloatingField id="plannedDays" label="จำนวนวันตามแผน" type="number" min="0" step="0.5" defaultValue={val("plannedDays")} />
            <div className="row g-2">
              <div className="col-sm-6"><FloatingField id="isoActivity" label="กิจกรรม ISO" defaultValue={val("isoActivity")} /></div>
              <div className="col-sm-6"><FloatingField id="qaType" label="ชนิดการทดสอบ" defaultValue={val("qaType")} /></div>
            </div>
            <FloatingField id="outputWp" label="ผลลัพธ์ (WP)" defaultValue={val("outputWp")} />
            <FloatingTextarea id="note" label="หมายเหตุ" rows={3} defaultValue={val("note")} />
            {task && <ProgressFields v={v} task={task} />}
          </>
        );
      }}
    </FormDialog>
  );
}

export function ProgressDialog({ task }: { task: TaskFormValue }) {
  return (
    <FormDialog title="อัปเดตความคืบหน้า" trigger="อัปเดตความคืบหน้า" triggerIcon="trending_up" action={updateTaskProgressAction}>
      {(v) => (
        <>
          <input type="hidden" name="taskId" value={task.id} />
          <ProgressFields v={v} task={task} />
        </>
      )}
    </FormDialog>
  );
}
