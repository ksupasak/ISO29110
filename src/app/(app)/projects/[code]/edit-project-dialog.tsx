"use client";

import { updateProjectAction } from "@/features/projects/actions";
import { FormDialog } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

export function EditProjectDialog({ project }: { project: EditableProject }) {
  return (
    <FormDialog title="แก้ไขข้อมูลโครงการ" trigger="แก้ไขข้อมูลโครงการ" action={updateProjectAction}>
      {(v) => {
        const val = (k: keyof EditableProject) => v[k] ?? project[k];
        return (
          <>
            <input type="hidden" name="projectId" value={project.id} />
            <Field id="name" label="ชื่อโครงการ" required defaultValue={val("name")} />
            <Field id="shortName" label="ชื่อย่อ" defaultValue={val("shortName")} />
            <Field id="customerName" label="ชื่อลูกค้า" defaultValue={val("customerName")} />
            <div className="space-y-1">
              <Label htmlFor="status">สถานะ</Label>
              <select
                key={val("status")}
                id="status"
                name="status"
                defaultValue={val("status")}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="startDate" label="วันเริ่ม" type="date" defaultValue={val("startDate")} />
              <Field id="endDate" label="วันสิ้นสุด" type="date" defaultValue={val("endDate")} />
            </div>
            <Field id="budget" label="งบประมาณ (บาท)" type="number" min="0" step="0.01" defaultValue={val("budget")} />
            <div className="space-y-1">
              <Label htmlFor="description">รายละเอียด</Label>
              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={val("description")}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
              />
            </div>
          </>
        );
      }}
    </FormDialog>
  );
}
