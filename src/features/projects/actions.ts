"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/current-user";
import { formDate, formNumber, formText } from "@/lib/form";
import { createProject, updateProject } from "./service";

/** `values` echoes the submitted fields so the form can repopulate after an error (React resets forms after an action). */
export type ProjectFormState = { error?: string; values?: Record<string, string> };

const FIELDS = ["code", "name", "shortName", "customerName", "startDate", "endDate", "budget", "pmUserId"] as const;

export async function createProjectAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const admin = await requireAdmin();
  const values = Object.fromEntries(FIELDS.map((k) => [k, formText(formData, k)]));
  const budget = formNumber(formData, "budget");
  if (Number.isNaN(budget)) return { error: "งบประมาณไม่ถูกต้อง", values };
  const r = await createProject(admin, {
    code: formText(formData, "code"),
    name: formText(formData, "name"),
    shortName: formText(formData, "shortName"),
    customerName: formText(formData, "customerName"),
    startDate: formDate(formData, "startDate"),
    endDate: formDate(formData, "endDate"),
    budget,
    pmUserId: formText(formData, "pmUserId"),
  });
  if (!r.ok) return { error: r.error, values };
  revalidatePath("/");
  redirect("/");
}

export type EditProjectState = { error?: string; ok?: boolean; values?: Record<string, string> };

const EDIT_FIELDS = ["name", "shortName", "customerName", "status", "startDate", "endDate", "budget", "description"] as const;

export async function updateProjectAction(_prev: EditProjectState, formData: FormData): Promise<EditProjectState> {
  const user = await requireUser();
  const values = Object.fromEntries(EDIT_FIELDS.map((k) => [k, formText(formData, k)]));
  const budget = formNumber(formData, "budget");
  if (Number.isNaN(budget)) return { error: "งบประมาณไม่ถูกต้อง", values };
  const status = formText(formData, "status");
  const r = await updateProject(user, formText(formData, "projectId"), {
    name: formText(formData, "name"),
    shortName: formText(formData, "shortName"),
    customerName: formText(formData, "customerName"),
    status: status as "PLANNING" | "ACTIVE" | "CLOSED",
    startDate: formDate(formData, "startDate"),
    endDate: formDate(formData, "endDate"),
    budget,
    description: formText(formData, "description"),
  });
  if (!r.ok) return { error: r.error, values };
  revalidatePath("/");
  revalidatePath("/projects/[code]", "layout");
  return { ok: true };
}
