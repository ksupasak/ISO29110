"use client";

import { useActionState } from "react";
import { createProjectAction, type ProjectFormState } from "@/features/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ProjectFormState = {};

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

export function NewProjectForm({ users }: { users: { id: string; fullName: string; username: string }[] }) {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field id="code" label="รหัสโครงการ" required placeholder="INT-2569-001" defaultValue={v.code} />
      <Field id="name" label="ชื่อโครงการ" required defaultValue={v.name} />
      <Field id="shortName" label="ชื่อย่อ" defaultValue={v.shortName} />
      <Field id="customerName" label="ชื่อลูกค้า" defaultValue={v.customerName} />
      <div className="grid grid-cols-2 gap-4">
        <Field id="startDate" label="วันเริ่ม" type="date" defaultValue={v.startDate} />
        <Field id="endDate" label="วันสิ้นสุด" type="date" defaultValue={v.endDate} />
      </div>
      <Field id="budget" label="งบประมาณ (บาท)" type="number" min="0" step="0.01" defaultValue={v.budget} />
      <div className="space-y-1">
        <Label htmlFor="pmUserId">ผู้จัดการโครงการ (PM)</Label>
        <select
          key={v.pmUserId ?? ""}
          id="pmUserId"
          name="pmUserId"
          required
          defaultValue={v.pmUserId ?? ""}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="" disabled>เลือกผู้ใช้</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>
          ))}
        </select>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>สร้างโครงการ</Button>
    </form>
  );
}
