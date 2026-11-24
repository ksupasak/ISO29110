"use server";

import { revalidatePath } from "next/cache";
import type { RequirementStatus, RequirementType, UnitTestStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formText, formValues, type FormState } from "@/lib/form";
import { fail } from "@/lib/result";
import {
  createAgreementItem,
  createComponent,
  createRequirement,
  deleteAgreementItem,
  deleteComponent,
  deleteRequirement,
  setRequirementComponents,
  setRequirementStatus,
  setTaskComponents,
  setTaskRequirements,
  updateAgreementItem,
  updateComponent,
  updateRequirement,
} from "./service";

type Result = { ok: true } | { ok: false; error: string };

function toState(r: Result, values?: Record<string, string>): FormState {
  if (r.ok) {
    revalidatePath("/projects/[code]", "layout");
    return { ok: true };
  }
  return { error: r.error, values };
}

const ids = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");

export async function createAgreementItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await createAgreementItem(user, formText(fd, "projectId"), { text: formText(fd, "text") }), formValues(fd));
}

export async function updateAgreementItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateAgreementItem(user, formText(fd, "id"), { text: formText(fd, "text") }), formValues(fd));
}

export async function deleteAgreementItemAction(id: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteAgreementItem(user, id));
}

function requirementFields(fd: FormData) {
  return {
    text: formText(fd, "text"),
    priority: formText(fd, "priority"),
    agreementItemId: formText(fd, "agreementItemId"),
    designRef: formText(fd, "designRef"),
  };
}

export async function createRequirementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(
    await createRequirement(user, formText(fd, "projectId"), {
      type: formText(fd, "type") as RequirementType,
      ...requirementFields(fd),
    }),
    formValues(fd),
  );
}

export async function updateRequirementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateRequirement(user, formText(fd, "id"), requirementFields(fd)), formValues(fd));
}

export async function setRequirementStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await setRequirementStatus(user, formText(fd, "id"), formText(fd, "status") as RequirementStatus), formValues(fd));
}

export async function deleteRequirementAction(id: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteRequirement(user, id));
}

function componentFields(fd: FormData) {
  return {
    name: formText(fd, "name"),
    description: formText(fd, "description"),
    ownerId: formText(fd, "ownerId"),
    unitTestStatus: (formText(fd, "unitTestStatus") || undefined) as UnitTestStatus | undefined,
    version: formText(fd, "version"),
  };
}

export async function createComponentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await createComponent(user, formText(fd, "projectId"), componentFields(fd)), formValues(fd));
}

export async function updateComponentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateComponent(user, formText(fd, "id"), componentFields(fd)), formValues(fd));
}

export async function deleteComponentAction(id: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteComponent(user, id));
}

/** Both link sets of a task in one dialog; the second is only written when the first succeeded. */
export async function setTaskLinksAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const taskId = formText(fd, "taskId");
  const first = await setTaskRequirements(user, taskId, ids(fd, "requirementIds"));
  if (!first.ok) return toState(first);
  return toState(await setTaskComponents(user, taskId, ids(fd, "componentIds")));
}

export async function setRequirementComponentsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = formText(fd, "id");
  if (!id) return toState(fail("ไม่พบ Requirement"));
  return toState(await setRequirementComponents(user, id, ids(fd, "componentIds")));
}
