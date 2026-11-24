"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction, type PasswordFormState } from "@/features/users/actions";
import { FloatingField } from "@/components/form-fields";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, {} as PasswordFormState);
  return (
    // Remounted after a success so the typed passwords are cleared.
    <form key={state.ok ? "done" : "form"} action={action} className="d-grid gap-3" style={{ maxWidth: "28rem" }}>
      <FloatingField id="current" label="รหัสผ่านเดิม" type="password" autoComplete="current-password" required />
      <FloatingField id="next" label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" type="password" autoComplete="new-password" minLength={8} required />
      <FloatingField id="confirm" label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" required />
      {state.error && <p role="alert" className="alert alert-danger py-2 small mb-0">{state.error}</p>}
      {state.ok && <p role="status" className="alert alert-success py-2 small mb-0">เปลี่ยนรหัสผ่านแล้ว</p>}
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary">บันทึก</button>
      </div>
    </form>
  );
}
