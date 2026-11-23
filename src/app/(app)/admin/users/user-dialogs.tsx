"use client";

import { useState, useTransition } from "react";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/features/users/actions";
import { FormDialog } from "@/components/form-dialog";
import { FloatingField, FloatingSelect } from "@/components/form-fields";
import { IconButton } from "@/components/icon-button";

type UserRow = { id: string; username: string; fullName: string; position: string | null; systemRole: "ADMIN" | "USER" };

function RoleSelect({ defaultValue }: { defaultValue: "ADMIN" | "USER" }) {
  return (
    <FloatingSelect key={defaultValue} id="systemRole" label="สิทธิ์ระบบ" defaultValue={defaultValue}>
      <option value="USER">ผู้ใช้ทั่วไป</option>
      <option value="ADMIN">ผู้ดูแลระบบ</option>
    </FloatingSelect>
  );
}

export function CreateUserDialog() {
  return (
    <FormDialog title="เพิ่มผู้ใช้งาน" trigger="เพิ่มผู้ใช้งาน" action={createUserAction} submitLabel="บันทึก" triggerIcon="person_add" triggerVariant="primary">
      {(v) => (
        <>
          <FloatingField id="username" label="ชื่อผู้ใช้" required autoComplete="off" defaultValue={v.username} />
          <FloatingField id="fullName" label="ชื่อ-นามสกุล" required defaultValue={v.fullName} />
          <FloatingField id="position" label="ตำแหน่ง" defaultValue={v.position} />
          <FloatingField id="password" label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)" type="password" required autoComplete="new-password" />
          <RoleSelect defaultValue={v.systemRole === "ADMIN" ? "ADMIN" : "USER"} />
        </>
      )}
    </FormDialog>
  );
}

export function EditUserDialog({ user }: { user: UserRow }) {
  return (
    <FormDialog title={`แก้ไข ${user.username}`} trigger="แก้ไข" action={updateUserAction} submitLabel="บันทึก" triggerIcon="edit" iconOnly>
      {(v) => (
        <>
          <input type="hidden" name="id" value={user.id} />
          <FloatingField id="fullName" label="ชื่อ-นามสกุล" required defaultValue={v.fullName ?? user.fullName} />
          <FloatingField id="position" label="ตำแหน่ง" defaultValue={v.position ?? user.position ?? ""} />
          <RoleSelect defaultValue={(v.systemRole ?? user.systemRole) === "ADMIN" ? "ADMIN" : "USER"} />
        </>
      )}
    </FormDialog>
  );
}

export function ResetPasswordDialog({ userId, username }: { userId: string; username: string }) {
  return (
    <FormDialog
      title={`รีเซ็ตรหัสผ่าน ${username}`}
      trigger="รีเซ็ตรหัสผ่าน"
      action={resetPasswordAction}
      submitLabel="รีเซ็ต"
      triggerIcon="lock_reset"
      iconOnly
    >
      {() => (
        <>
          <input type="hidden" name="id" value={userId} />
          <FloatingField id="password" label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" type="password" required autoComplete="new-password" />
        </>
      )}
    </FormDialog>
  );
}

export function ActiveToggle({ userId, active, isSelf }: { userId: string; active: boolean; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <IconButton
        icon={active ? "block" : "check_circle"}
        label={active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        disabled={pending || (isSelf && active)}
        onClick={() =>
          startTransition(async () => {
            const r = await setUserActiveAction(userId, !active);
            setError(r.error ?? null);
          })
        }
      />
      {error && <span role="alert" className="text-danger small">{error}</span>}
    </>
  );
}
