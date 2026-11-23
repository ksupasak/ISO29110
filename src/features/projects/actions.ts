"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/current-user";
import { formDate, formNumber, formText } from "@/lib/form";
import { createProject } from "./service";

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
