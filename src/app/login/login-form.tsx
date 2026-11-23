"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="d-grid gap-3">
      <div className="form-floating">
        <input id="username" name="username" autoComplete="username" required autoFocus
          className="form-control" placeholder="ชื่อผู้ใช้" />
        <label htmlFor="username">ชื่อผู้ใช้</label>
      </div>
      <div className="form-floating">
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="form-control" placeholder="รหัสผ่าน" />
        <label htmlFor="password">รหัสผ่าน</label>
      </div>
      {state.error && <p role="alert" className="alert alert-danger py-2 px-3 small mb-0">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-100 mt-1">
        เข้าสู่ระบบ
      </button>
    </form>
  );
}
