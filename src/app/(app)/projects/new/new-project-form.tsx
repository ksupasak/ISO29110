"use client";

import { useActionState } from "react";
import { createProjectAction, type ProjectFormState } from "@/features/projects/actions";
import { AppCard } from "@/components/app-card";
import { FloatingField, FloatingSelect } from "@/components/form-fields";
import { Icon } from "@/components/icon";

const initial: ProjectFormState = {};

export function NewProjectForm({ users }: { users: { id: string; fullName: string; username: string }[] }) {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  const v = state.values ?? {};
  return (
    <AppCard>
      <form action={action} className="card-body row g-3">
        <div className="col-md-6">
          <FloatingField id="code" label="รหัสโครงการ" required placeholder="INT-2569-001" defaultValue={v.code} />
        </div>
        <div className="col-md-6">
          <FloatingField id="name" label="ชื่อโครงการ" required defaultValue={v.name} />
        </div>
        <div className="col-md-6">
          <FloatingField id="shortName" label="ชื่อย่อ" defaultValue={v.shortName} />
        </div>
        <div className="col-md-6">
          <FloatingField id="customerName" label="ชื่อลูกค้า" defaultValue={v.customerName} />
        </div>
        <div className="col-md-6">
          <FloatingField id="startDate" label="วันเริ่ม" type="date" defaultValue={v.startDate} />
        </div>
        <div className="col-md-6">
          <FloatingField id="endDate" label="วันสิ้นสุด" type="date" defaultValue={v.endDate} />
        </div>
        <div className="col-md-6">
          <FloatingField id="budget" label="งบประมาณ (บาท)" type="number" min="0" step="0.01" defaultValue={v.budget} />
        </div>
        <div className="col-md-6">
          <FloatingSelect key={v.pmUserId ?? ""} id="pmUserId" label="ผู้จัดการโครงการ (PM)" required defaultValue={v.pmUserId ?? ""}>
            <option value="" disabled>เลือกผู้ใช้</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
            ))}
          </FloatingSelect>
        </div>
        {state.error && (
          <div className="col-12">
            <p role="alert" className="alert alert-danger py-2 px-3 small mb-0">{state.error}</p>
          </div>
        )}
        <div className="col-12 d-flex justify-content-end">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <Icon name="add" />
            สร้างโครงการ
          </button>
        </div>
      </form>
    </AppCard>
  );
}
