"use client";

import { createComponentAction, updateComponentAction } from "@/features/trace/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect, FloatingTextarea } from "@/components/form-fields";
import { UNIT_TEST_LABEL } from "@/lib/labels";

export type ComponentFormValue = {
  id: string;
  code: string;
  name: string;
  description: string;
  ownerId: string;
  unitTestStatus: string;
  version: string;
};

export function ComponentDialog({
  projectId,
  component,
  members,
}: {
  projectId: string;
  component?: ComponentFormValue;
  members: { id: string; label: string }[];
}) {
  return (
    <FormDialog
      title={component ? `แก้ไข ${component.code}` : "เพิ่ม Component"}
      trigger={component ? "แก้ไข" : "เพิ่ม Component"}
      triggerIcon={component ? "edit" : "add"}
      action={component ? updateComponentAction : createComponentAction}
    >
      {(v) => (
        <>
          {component ? <input type="hidden" name="id" value={component.id} /> : <input type="hidden" name="projectId" value={projectId} />}
          <FloatingField id="name" label="ชื่อ Component" required defaultValue={v.name ?? component?.name ?? ""} />
          <FloatingTextarea id="description" label="รายละเอียด" rows={3} defaultValue={v.description ?? component?.description ?? ""} />
          <FloatingSelect key={`owner-${v.ownerId ?? ""}`} id="ownerId" label="ผู้รับผิดชอบ" defaultValue={v.ownerId ?? component?.ownerId ?? ""}>
            <option value="">ยังไม่ระบุ</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </FloatingSelect>
          <FloatingSelect
            key={`ut-${v.unitTestStatus ?? ""}`}
            id="unitTestStatus"
            label="สถานะการทดสอบ"
            defaultValue={v.unitTestStatus ?? component?.unitTestStatus ?? "NOT_TESTED"}
          >
            {(Object.keys(UNIT_TEST_LABEL) as (keyof typeof UNIT_TEST_LABEL)[]).map((s) => (
              <option key={s} value={s}>{UNIT_TEST_LABEL[s]}</option>
            ))}
          </FloatingSelect>
          <FloatingField id="version" label="เวอร์ชัน" defaultValue={v.version ?? component?.version ?? ""} />
        </>
      )}
    </FormDialog>
  );
}
