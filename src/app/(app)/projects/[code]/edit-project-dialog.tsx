"use client";

import { updateProjectAction } from "@/features/projects/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect, FloatingTextarea } from "@/components/form-fields";
import { STATUS_LABEL } from "@/lib/labels";

export type EditableProject = {
  id: string;
  name: string;
  shortName: string;
  customerName: string;
  status: "PLANNING" | "ACTIVE" | "CLOSED";
  startDate: string;
  endDate: string;
  budget: string;
  description: string;
};

export function EditProjectDialog({ project }: { project: EditableProject }) {
  return (
    <FormDialog title="แก้ไขข้อมูลโครงการ" trigger="แก้ไขข้อมูลโครงการ" action={updateProjectAction} triggerIcon="edit">
      {(v) => {
        const val = (k: keyof EditableProject) => v[k] ?? project[k];
        return (
          <>
            <input type="hidden" name="projectId" value={project.id} />
            <FloatingField id="name" label="ชื่อโครงการ" required defaultValue={val("name")} />
            <FloatingField id="shortName" label="ชื่อย่อ" defaultValue={val("shortName")} />
            <FloatingField id="customerName" label="ชื่อลูกค้า" defaultValue={val("customerName")} />
            <FloatingSelect key={val("status")} id="status" label="สถานะ" defaultValue={val("status")}>
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </FloatingSelect>
            <div className="row g-3">
              <div className="col-sm-6">
                <FloatingField id="startDate" label="วันเริ่ม" type="date" defaultValue={val("startDate")} />
              </div>
              <div className="col-sm-6">
                <FloatingField id="endDate" label="วันสิ้นสุด" type="date" defaultValue={val("endDate")} />
              </div>
            </div>
            <FloatingField id="budget" label="งบประมาณ (บาท)" type="number" min="0" step="0.01" defaultValue={val("budget")} />
            <FloatingTextarea id="description" label="รายละเอียด" defaultValue={val("description")} />
          </>
        );
      }}
    </FormDialog>
  );
}
