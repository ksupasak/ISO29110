"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireAdmin, requireUser } from "@/lib/auth/current-user";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { formText } from "@/lib/form";
import { changeOwnPassword, createUser, resetPassword, setUserActive, updateUser } from "./service";

/** `values` echoes non-secret submitted fields so the dialog can repopulate after an error. */
export type UserFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

function toState(r: { ok: true } | { ok: false; error: string }, formData: FormData): UserFormState {
  if (r.ok) {
    revalidatePath("/admin/users");
    return { ok: true };
  }
  const values = Object.fromEntries(
    ["username", "fullName", "position", "systemRole"].map((k) => [k, formText(formData, k)]),
  );
  return { error: r.error, values };
}

function role(formData: FormData): "ADMIN" | "USER" {
  return formText(formData, "systemRole") === "ADMIN" ? "ADMIN" : "USER";
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  return toState(
    await createUser(admin, {
      username: formText(formData, "username"),
      fullName: formText(formData, "fullName"),
      position: formText(formData, "position"),
      password: formText(formData, "password"),
      systemRole: role(formData),
    }),
    formData,
  );
}

export async function updateUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  return toState(
    await updateUser(admin, formText(formData, "id"), {
      fullName: formText(formData, "fullName"),
      position: formText(formData, "position"),
      systemRole: role(formData),
    }),
    formData,
  );
}

export async function resetPasswordAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireAdmin();
  return toState(await resetPassword(admin, formText(formData, "id"), formText(formData, "password")), formData);
}

export async function setUserActiveAction(id: string, active: boolean): Promise<UserFormState> {
  const admin = await requireAdmin();
  return toState(await setUserActive(admin, id, active), new FormData());
}

export type PasswordFormState = { error?: string; ok?: boolean };

/** Never echoes the typed passwords back. */
export async function changeOwnPasswordAction(_prev: PasswordFormState, formData: FormData): Promise<PasswordFormState> {
  const user = await requireUser();
  const next = formText(formData, "next");
  if (next !== formText(formData, "confirm")) return { error: "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const r = await changeOwnPassword(user, { current: formText(formData, "current"), next, currentSessionToken: token });
  return r.ok ? { ok: true } : { error: r.error };
}
