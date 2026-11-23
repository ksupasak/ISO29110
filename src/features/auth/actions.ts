"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession, SESSION_COOKIE } from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = username && password ? await authenticate(username, password) : null;
  if (!user) return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

  const { token, expiresAt } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
