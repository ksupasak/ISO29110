"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="username" className="text-sm font-medium">ชื่อผู้ใช้</label>
        <input id="username" name="username" autoComplete="username" required autoFocus
          className="w-full rounded-md border px-3 py-2" />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium">รหัสผ่าน</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="w-full rounded-md border px-3 py-2" />
      </div>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-50">
        เข้าสู่ระบบ
      </button>
    </form>
  );
}
