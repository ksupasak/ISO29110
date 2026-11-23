"use server";

import { revalidatePath } from "next/cache";
import type { ProjectRole } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formNumber, formText } from "@/lib/form";
import { addMember, removeMember, updateMember } from "./service";

/** `values` echoes the submitted fields so the dialog can repopulate after an error. */
export type MemberFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

type Result = { ok: true } | { ok: false; error: string };

function toState(r: Result, values?: Record<string, string>): MemberFormState {
  if (r.ok) {
    revalidatePath("/projects/[code]", "layout");
    return { ok: true };
  }
  return { error: r.error, values };
}

function readForm(formData: FormData) {
  const roles = formData.getAll("roles").filter((v): v is string => typeof v === "string") as ProjectRole[];
  const primaryRole = formText(formData, "primaryRole") as ProjectRole;
  const dailyRate = formNumber(formData, "dailyRate");
  const values = {
    userId: formText(formData, "userId"),
    primaryRole,
    dailyRate: formText(formData, "dailyRate"),
    roles: roles.join(","),
  };
  return { roles, primaryRole, dailyRate, values };
}

export async function addMemberAction(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const user = await requireUser();
  const { roles, primaryRole, dailyRate, values } = readForm(formData);
  if (Number.isNaN(dailyRate)) return { error: "อัตราต่อวันไม่ถูกต้อง", values };
  return toState(
    await addMember(user, formText(formData, "projectId"), {
      userId: values.userId,
      roles,
      primaryRole,
      dailyRate,
    }),
    values,
  );
}

/** The rate field is only rendered for callers who may see rates; when absent the stored rate is left untouched. */
export async function updateMemberAction(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const user = await requireUser();
  const { roles, primaryRole, dailyRate, values } = readForm(formData);
  if (Number.isNaN(dailyRate)) return { error: "อัตราต่อวันไม่ถูกต้อง", values };
  const hasRate = formData.has("dailyRate");
  return toState(
    await updateMember(user, formText(formData, "memberId"), {
      roles,
      primaryRole,
      ...(hasRate ? { dailyRate } : {}),
    }),
    values,
  );
}

export async function removeMemberAction(memberId: string): Promise<MemberFormState> {
  const user = await requireUser();
  return toState(await removeMember(user, memberId));
}
