"use client";

import {
  createAgreementItemAction,
  createRequirementAction,
  setRequirementStatusAction,
  updateAgreementItemAction,
  updateRequirementAction,
} from "@/features/trace/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect, FloatingTextarea } from "@/components/form-fields";
import { REQUIREMENT_STATUS_LABEL, REQUIREMENT_TYPE_LABEL } from "@/lib/labels";

type Option = { id: string; label: string };

export function AgreementItemDialog({
  projectId,
  item,
}: {
  projectId: string;
  item?: { id: string; code: string; text: string };
}) {
  return (
    <FormDialog
      title={item ? `แก้ไข ${item.code}` : "เพิ่มขอบเขต"}
      trigger={item ? "แก้ไข" : "เพิ่มขอบเขต"}
      triggerIcon={item ? "edit" : "add"}
      iconOnly={!!item}
      action={item ? updateAgreementItemAction : createAgreementItemAction}
    >
      {(v) => (
        <>
          {item ? <input type="hidden" name="id" value={item.id} /> : <input type="hidden" name="projectId" value={projectId} />}
          <FloatingTextarea id="text" label="รายละเอียด" required rows={4} defaultValue={v.text ?? item?.text ?? ""} />
        </>
      )}
    </FormDialog>
  );
}

export type RequirementFormValue = {
  id: string;
  code: string;
  status: string;
  text: string;
  priority: string;
  agreementItemId: string;
  designRef: string;
};

export function RequirementDialog({
  projectId,
  requirement,
  agreements,
}: {
  projectId: string;
  requirement?: RequirementFormValue;
  agreements: Option[];
}) {
  return (
    <FormDialog
      title={requirement ? `แก้ไข ${requirement.code}` : "เพิ่ม Requirement"}
      trigger={requirement ? "แก้ไข" : "เพิ่ม Requirement"}
      triggerIcon={requirement ? "edit" : "add"}
      action={requirement ? updateRequirementAction : createRequirementAction}
    >
      {(v) => (
        <>
          {requirement ? (
            <input type="hidden" name="id" value={requirement.id} />
          ) : (
            <>
              <input type="hidden" name="projectId" value={projectId} />
              <FloatingSelect key={`type-${v.type ?? ""}`} id="type" label="ประเภท" required defaultValue={v.type ?? "FUNCTIONAL"}>
                {(Object.keys(REQUIREMENT_TYPE_LABEL) as (keyof typeof REQUIREMENT_TYPE_LABEL)[]).map((t) => (
                  <option key={t} value={t}>{REQUIREMENT_TYPE_LABEL[t]}</option>
                ))}
              </FloatingSelect>
            </>
          )}
          <FloatingTextarea
            id="text"
            label="รายละเอียด"
            required
            rows={4}
            readOnly={requirement?.status === "APPROVED"}
            defaultValue={v.text ?? requirement?.text ?? ""}
          />
          {requirement?.status === "APPROVED" && (
            <p className="small text-body-secondary mb-0">Requirement ที่อนุมัติแล้วแก้รายละเอียดไม่ได้ ต้องเปลี่ยนสถานะกลับก่อน</p>
          )}
          <FloatingField id="priority" label="ลำดับความสำคัญ" defaultValue={v.priority ?? requirement?.priority ?? ""} />
          <FloatingSelect
            key={`ag-${v.agreementItemId ?? ""}`}
            id="agreementItemId"
            label="ขอบเขตตาม Agreement"
            defaultValue={v.agreementItemId ?? requirement?.agreementItemId ?? ""}
          >
            <option value="">ไม่ระบุ</option>
            {agreements.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </FloatingSelect>
          <FloatingField id="designRef" label="อ้างอิงการออกแบบ" defaultValue={v.designRef ?? requirement?.designRef ?? ""} />
        </>
      )}
    </FormDialog>
  );
}

export function RequirementStatusDialog({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  return (
    <FormDialog title="เปลี่ยนสถานะ" trigger="เปลี่ยนสถานะ" triggerIcon="swap_horiz" action={setRequirementStatusAction}>
      {(v) => (
        <>
          <input type="hidden" name="id" value={id} />
          <FloatingSelect key={`st-${v.status ?? ""}`} id="status" label="สถานะ" defaultValue={v.status ?? status}>
            {(Object.keys(REQUIREMENT_STATUS_LABEL) as (keyof typeof REQUIREMENT_STATUS_LABEL)[])
              .filter((s) => canApprove || s !== "APPROVED")
              .map((s) => (
              <option key={s} value={s}>{REQUIREMENT_STATUS_LABEL[s]}</option>
            ))}
          </FloatingSelect>
        </>
      )}
    </FormDialog>
  );
}
