"use server";

import { revalidatePath } from "next/cache";
import type { AttachmentKind } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formText } from "@/lib/form";
import { readFormFile as readFile } from "@/lib/form-file";
import { addAttachment, setDocumentStatus, uploadVersion } from "./service";

/** `values` echoes the submitted text fields so the dialog can repopulate after an error. */
export type DocFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

type Result = { ok: true } | { ok: false; error: string };

function toState(r: Result, values?: Record<string, string>): DocFormState {
  if (r.ok) {
    revalidatePath("/projects/[code]/documents", "page");
    return { ok: true };
  }
  return { error: r.error, values };
}

export async function uploadVersionAction(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  const user = await requireUser();
  const values = { version: formText(formData, "version"), note: formText(formData, "note") };
  const file = await readFile(formData);
  if (typeof file === "string") return { error: file, values };
  return toState(
    await uploadVersion(user, formText(formData, "projectId"), formText(formData, "wpCode"), { ...values, ...file }),
    values,
  );
}

export async function addAttachmentAction(_prev: DocFormState, formData: FormData): Promise<DocFormState> {
  const user = await requireUser();
  const values = { kind: formText(formData, "kind") };
  const file = await readFile(formData);
  if (typeof file === "string") return { error: file, values };
  return toState(
    await addAttachment(user, formText(formData, "projectId"), {
      entityType: "WpDocument",
      entityId: formText(formData, "entityId"),
      kind: values.kind as AttachmentKind,
      ...file,
    }),
    values,
  );
}

export async function setStatusAction(projectId: string, wpCode: string, status: string): Promise<DocFormState> {
  const user = await requireUser();
  return toState(await setDocumentStatus(user, projectId, wpCode, status));
}
