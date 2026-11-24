"use server";

import { revalidatePath } from "next/cache";
import type { TaskKind, TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formDate, formNumber, formText, formValues, type FormState } from "@/lib/form";
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  updateMilestone,
  updateTask,
  updateTaskProgress,
  type MilestoneInput,
  type TaskInput,
  type TaskProgressInput,
} from "./service";

type Result = { ok: true } | { ok: false; error: string };

function toState(r: Result, values?: Record<string, string>): FormState {
  if (r.ok) {
    revalidatePath("/projects/[code]", "layout");
    return { ok: true };
  }
  return { error: r.error, values };
}

function milestoneInput(fd: FormData): MilestoneInput {
  return {
    name: formText(fd, "name"),
    plannedDate: formDate(fd, "plannedDate") as Date,
    revisedDate: formDate(fd, "revisedDate"),
    actualDate: formDate(fd, "actualDate"),
  };
}

/** Progress fields are only read when the form has them, so a create form leaves the defaults alone. */
function progressInput(fd: FormData): TaskProgressInput {
  const out: TaskProgressInput = {};
  if (fd.has("status")) out.status = formText(fd, "status") as TaskStatus;
  if (fd.has("percent")) {
    const v = formNumber(fd, "percent");
    if (v !== null) out.percent = v;
  }
  if (fd.has("actualStart")) out.actualStart = formDate(fd, "actualStart");
  if (fd.has("actualEnd")) out.actualEnd = formDate(fd, "actualEnd");
  if (fd.has("actualDays")) out.actualDays = formNumber(fd, "actualDays");
  return out;
}

function taskInput(fd: FormData): TaskInput {
  const plannedDays = formNumber(fd, "plannedDays");
  return {
    title: formText(fd, "title"),
    kind: (formText(fd, "kind") || undefined) as TaskKind | undefined,
    wbsCode: formText(fd, "wbsCode"),
    parentId: formText(fd, "parentId"),
    isoActivity: formText(fd, "isoActivity"),
    qaType: formText(fd, "qaType"),
    assigneeId: formText(fd, "assigneeId"),
    milestoneId: formText(fd, "milestoneId"),
    plannedStart: formDate(fd, "plannedStart"),
    plannedEnd: formDate(fd, "plannedEnd"),
    plannedDays,
    outputWp: formText(fd, "outputWp"),
    note: formText(fd, "note"),
    ...progressInput(fd),
  };
}

export async function createMilestoneAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await createMilestone(user, formText(fd, "projectId"), milestoneInput(fd)), formValues(fd));
}

export async function updateMilestoneAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateMilestone(user, formText(fd, "milestoneId"), milestoneInput(fd)), formValues(fd));
}

export async function deleteMilestoneAction(milestoneId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteMilestone(user, milestoneId));
}

export async function createTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await createTask(user, formText(fd, "projectId"), taskInput(fd)), formValues(fd));
}

export async function updateTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateTask(user, formText(fd, "taskId"), taskInput(fd)), formValues(fd));
}

export async function updateTaskProgressAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateTaskProgress(user, formText(fd, "taskId"), progressInput(fd)), formValues(fd));
}

export async function deleteTaskAction(taskId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteTask(user, taskId));
}
