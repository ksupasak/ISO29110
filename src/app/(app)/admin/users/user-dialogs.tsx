"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
  type UserFormState,
} from "@/features/users/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserRow = { id: string; username: string; fullName: string; position: string | null; systemRole: "ADMIN" | "USER" };

const initial: UserFormState = {};

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

function RoleSelect({ defaultValue }: { defaultValue: "ADMIN" | "USER" }) {
  return (
    <div className="space-y-1">
      <Label htmlFor="systemRole">สิทธิ์ระบบ</Label>
      <select
        key={defaultValue}
        id="systemRole"
        name="systemRole"
        defaultValue={defaultValue}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
      >
        <option value="USER">ผู้ใช้ทั่วไป</option>
        <option value="ADMIN">ผู้ดูแลระบบ</option>
      </select>
    </div>
  );
}

/** Dialog that submits a server action and closes itself on success. */
function FormDialog({
  title,
  trigger,
  action,
  submitLabel,
  children,
}: {
  title: string;
  trigger: string;
  action: (prev: UserFormState, formData: FormData) => Promise<UserFormState>;
  submitLabel: string;
  children: (values: Record<string, string>) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: UserFormState, fd: FormData) => {
    const next = await action(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, initial);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {children(state.values ?? {})}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>{submitLabel}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateUserDialog() {
  return (
    <FormDialog title="เพิ่มผู้ใช้งาน" trigger="เพิ่มผู้ใช้งาน" action={createUserAction} submitLabel="บันทึก">
      {(v) => (
        <>
          <Field id="username" label="ชื่อผู้ใช้" required autoComplete="off" defaultValue={v.username} />
          <Field id="fullName" label="ชื่อ-นามสกุล" required defaultValue={v.fullName} />
          <Field id="position" label="ตำแหน่ง" defaultValue={v.position} />
          <Field id="password" label="รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)" type="password" required autoComplete="new-password" />
          <RoleSelect defaultValue={v.systemRole === "ADMIN" ? "ADMIN" : "USER"} />
        </>
      )}
    </FormDialog>
  );
}

export function EditUserDialog({ user }: { user: UserRow }) {
  return (
    <FormDialog title={`แก้ไข ${user.username}`} trigger="แก้ไข" action={updateUserAction} submitLabel="บันทึก">
      {(v) => (
        <>
          <input type="hidden" name="id" value={user.id} />
          <Field id="fullName" label="ชื่อ-นามสกุล" required defaultValue={v.fullName ?? user.fullName} />
          <Field id="position" label="ตำแหน่ง" defaultValue={v.position ?? user.position ?? ""} />
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
    >
      {() => (
        <>
          <input type="hidden" name="id" value={userId} />
          <Field id="password" label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" type="password" required autoComplete="new-password" />
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
      <Button
        variant="outline"
        size="sm"
        disabled={pending || (isSelf && active)}
        onClick={() =>
          startTransition(async () => {
            const r = await setUserActiveAction(userId, !active);
            setError(r.error ?? null);
          })
        }
      >
        {active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </>
  );
}
