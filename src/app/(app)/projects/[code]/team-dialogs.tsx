"use client";

import { useState, useTransition } from "react";
import type { ProjectRole } from "@prisma/client";
import { addMemberAction, removeMemberAction, updateMemberAction } from "@/features/members/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect } from "@/components/form-fields";
import { IconButton } from "@/components/icon-button";
import { ROLE_LABEL, ROLE_ORDER } from "@/lib/labels";

export type TeamMember = {
  id: string;
  fullName: string;
  roles: ProjectRole[];
  primaryRole: ProjectRole;
  dailyRate: string | null;
};

/** Role switches plus a primary-role select limited to the checked roles. */
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
      <fieldset>
        <legend className="form-label small fw-medium text-body-secondary">บทบาท</legend>
        <div className="row row-cols-1 row-cols-sm-2 g-2">
          {ROLE_ORDER.map((r) => (
            <div key={r} className="col">
              <div className="form-check form-switch">
                <input
                  id={`role-${r}`}
                  type="checkbox"
                  role="switch"
                  className="form-check-input"
                  name="roles"
                  value={r}
                  checked={roles.includes(r)}
                  onChange={(e) => toggle(r, e.target.checked)}
                />
                <label htmlFor={`role-${r}`} className="form-check-label">{ROLE_LABEL[r]}</label>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <FloatingSelect id="primaryRole" label="บทบาทหลัก" value={primary} onChange={(e) => setPrimary(e.target.value as ProjectRole)}>
        {roles.length === 0 && <option value="">เลือกบทบาทก่อน</option>}
        {ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => (
          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
        ))}
      </FloatingSelect>
    </>
  );
}

function RateField({ defaultValue }: { defaultValue?: string }) {
  return <FloatingField id="dailyRate" label="อัตรา/วัน (บาท)" type="number" min="0" step="0.01" defaultValue={defaultValue} />;
}

export function AddMemberDialog({
  projectId,
  users,
}: {
  projectId: string;
  users: { id: string; fullName: string; position: string | null }[];
}) {
  return (
    <FormDialog title="เพิ่มสมาชิกทีม" trigger="เพิ่มสมาชิก" action={addMemberAction} triggerIcon="person_add">
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <FloatingSelect key={v.userId ?? ""} id="userId" label="ผู้ใช้" required defaultValue={v.userId ?? ""}>
            <option value="" disabled>เลือกผู้ใช้</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}{u.position ? ` (${u.position})` : ""}</option>
            ))}
          </FloatingSelect>
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
    <FormDialog title={`แก้ไข ${member.fullName}`} trigger="แก้ไข" action={updateMemberAction} triggerIcon="edit" iconOnly>
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
      <IconButton
        icon="person_remove"
        label="ลบ"
        tone="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`ลบ ${member.fullName} ออกจากทีม?`)) return;
          startTransition(async () => {
            const r = await removeMemberAction(member.id);
            setError(r.error ?? null);
          });
        }}
      />
      {error && <span role="alert" className="text-danger small">{error}</span>}
    </>
  );
}
