"use client";

import { useState, useTransition } from "react";
import type { ProjectRole } from "@prisma/client";
import { addMemberAction, removeMemberAction, updateMemberAction } from "@/features/members/actions";
import { FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/labels";

export type TeamMember = {
  id: string;
  fullName: string;
  roles: ProjectRole[];
  primaryRole: ProjectRole;
  dailyRate: string | null;
};

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** Role checkboxes plus a primary-role select limited to the checked roles. */
function RoleFields({ initialRoles, initialPrimary }: { initialRoles: ProjectRole[]; initialPrimary: ProjectRole | "" }) {
  const [roles, setRoles] = useState<ProjectRole[]>(initialRoles);
  const [primary, setPrimary] = useState<ProjectRole | "">(initialPrimary);
  const toggle = (r: ProjectRole, on: boolean) => {
    const next = on ? [...roles, r] : roles.filter((x) => x !== r);
    setRoles(next);
    if (!next.includes(primary as ProjectRole)) setPrimary(next[0] ?? "");
  };
  return (
    <>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">บทบาท</legend>
        <div className="grid grid-cols-2 gap-1">
          {ROLE_ORDER.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="roles" value={r} checked={roles.includes(r)} onChange={(e) => toggle(r, e.target.checked)} />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="primaryRole">บทบาทหลัก</Label>
        <select id="primaryRole" name="primaryRole" value={primary} onChange={(e) => setPrimary(e.target.value as ProjectRole)} className={SELECT_CLASS}>
          {roles.length === 0 && <option value="">เลือกบทบาทก่อน</option>}
          {ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function RateField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="dailyRate">อัตรา/วัน (บาท)</Label>
      <Input id="dailyRate" name="dailyRate" type="number" min="0" step="0.01" defaultValue={defaultValue} />
    </div>
  );
}

export function AddMemberDialog({
  projectId,
  users,
}: {
  projectId: string;
  users: { id: string; fullName: string; position: string | null }[];
}) {
  return (
    <FormDialog title="เพิ่มสมาชิกทีม" trigger="เพิ่มสมาชิก" action={addMemberAction}>
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-1">
            <Label htmlFor="userId">ผู้ใช้</Label>
            <select key={v.userId ?? ""} id="userId" name="userId" required defaultValue={v.userId ?? ""} className={SELECT_CLASS}>
              <option value="" disabled>เลือกผู้ใช้</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}{u.position ? ` (${u.position})` : ""}</option>
              ))}
            </select>
          </div>
          <RoleFields
            initialRoles={(v.roles ? v.roles.split(",") : []) as ProjectRole[]}
            initialPrimary={(v.primaryRole ?? "") as ProjectRole | ""}
          />
          <RateField defaultValue={v.dailyRate} />
        </>
      )}
    </FormDialog>
  );
}

export function EditMemberDialog({ member }: { member: TeamMember }) {
  return (
    <FormDialog title={`แก้ไข ${member.fullName}`} trigger="แก้ไข" action={updateMemberAction}>
      {(v) => (
        <>
          <input type="hidden" name="memberId" value={member.id} />
          <RoleFields
            initialRoles={(v.roles ? v.roles.split(",") : member.roles) as ProjectRole[]}
            initialPrimary={(v.primaryRole ?? member.primaryRole) as ProjectRole}
          />
          <RateField defaultValue={v.dailyRate ?? member.dailyRate ?? ""} />
        </>
      )}
    </FormDialog>
  );
}

export function RemoveMemberButton({ member }: { member: TeamMember }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`ลบ ${member.fullName} ออกจากทีม?`)) return;
          startTransition(async () => {
            const r = await removeMemberAction(member.id);
            setError(r.error ?? null);
          });
        }}
      >
        ลบ
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </>
  );
}
