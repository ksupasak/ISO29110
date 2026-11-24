"use server";

import { revalidatePath } from "next/cache";
import type { AttachmentKind, MeetingItemKind, OpenIssueStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formDate, formText, formValues, type FormState } from "@/lib/form";
import { readFormFile } from "@/lib/form-file";
import { addAttachment } from "@/features/documents/service";
import {
  MEETING_ENTITY,
  addAttendee,
  addItem,
  approveMeeting,
  createMeeting,
  createTaskFromIssue,
  deleteMeeting,
  linkIssueToTask,
  removeAttendee,
  removeItem,
  revertMeeting,
  updateAttendee,
  updateItem,
  updateMeeting,
  type AttendeeInput,
  type MeetingInput,
} from "./service";

type Result = { ok: true } | { ok: false; error: string };

/** Every page of the project is revalidated: meeting pages, and the plan pages a created or linked task shows on. */
function toState(r: Result, values?: Record<string, string>): FormState {
  if (r.ok) {
    revalidatePath("/projects/[code]", "layout");
    return { ok: true };
  }
  return { error: r.error, values };
}

function meetingInput(fd: FormData): MeetingInput {
  return {
    topic: formText(fd, "topic"),
    meetingDate: formDate(fd, "meetingDate") as Date,
    startTime: formText(fd, "startTime"),
    endTime: formText(fd, "endTime"),
    place: formText(fd, "place"),
    recorder: formText(fd, "recorder"),
    organizer: formText(fd, "organizer"),
    purpose: formText(fd, "purpose"),
    previousId: formText(fd, "previousId"),
    previousNote: formText(fd, "previousNote"),
    nextTopic: formText(fd, "nextTopic"),
    nextDate: formDate(fd, "nextDate"),
    nextStartTime: formText(fd, "nextStartTime"),
    nextEndTime: formText(fd, "nextEndTime"),
    nextPlace: formText(fd, "nextPlace"),
  };
}

function attendeeInput(fd: FormData): AttendeeInput {
  return {
    userId: formText(fd, "userId"),
    fullName: formText(fd, "fullName"),
    position: formText(fd, "position"),
    organization: formText(fd, "organization"),
    projectRole: formText(fd, "projectRole"),
    present: formText(fd, "present") !== "false",
  };
}

/** Open-issue fields; `status` only when the form carries it (a linked issue's form does not). */
function issueFields(fd: FormData) {
  return {
    ownerId: formText(fd, "ownerId"),
    ownerName: formText(fd, "ownerName"),
    dueDate: formDate(fd, "dueDate"),
    ...(fd.has("status") ? { status: formText(fd, "status") as OpenIssueStatus } : {}),
  };
}

/** On success `values.code` is the new meeting's code, so the dialog can open its page. */
export async function createMeetingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const r = await createMeeting(user, formText(fd, "projectId"), {
    topic: formText(fd, "topic"),
    meetingDate: formDate(fd, "meetingDate") as Date,
    previousId: formText(fd, "previousId"),
  });
  if (!r.ok) return { error: r.error, values: formValues(fd) };
  revalidatePath("/projects/[code]", "layout");
  return { ok: true, values: { code: r.data.code } };
}

export async function updateMeetingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateMeeting(user, formText(fd, "meetingId"), meetingInput(fd)), formValues(fd));
}

export async function deleteMeetingAction(meetingId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await deleteMeeting(user, meetingId));
}

export async function approveMeetingAction(meetingId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await approveMeeting(user, meetingId));
}

export async function revertMeetingAction(meetingId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await revertMeeting(user, meetingId));
}

export async function addAttendeeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await addAttendee(user, formText(fd, "meetingId"), attendeeInput(fd)), formValues(fd));
}

export async function updateAttendeeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateAttendee(user, formText(fd, "attendeeId"), attendeeInput(fd)), formValues(fd));
}

export async function removeAttendeeAction(attendeeId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await removeAttendee(user, attendeeId));
}

export async function addItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = formText(fd, "kind") as MeetingItemKind;
  return toState(
    await addItem(user, formText(fd, "meetingId"), { kind, text: formText(fd, "text"), ...issueFields(fd) }),
    formValues(fd),
  );
}

export async function updateItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await updateItem(user, formText(fd, "itemId"), { text: formText(fd, "text"), ...issueFields(fd) }), formValues(fd));
}

export async function removeItemAction(itemId: string): Promise<FormState> {
  const user = await requireUser();
  return toState(await removeItem(user, itemId));
}

/** An empty `taskId` removes the link. */
export async function linkIssueToTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(await linkIssueToTask(user, formText(fd, "itemId"), formText(fd, "taskId") || null), formValues(fd));
}

export async function createTaskFromIssueAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return toState(
    await createTaskFromIssue(user, formText(fd, "itemId"), {
      title: formText(fd, "title"),
      assigneeId: formText(fd, "assigneeId"),
      plannedEnd: formDate(fd, "plannedEnd"),
    }),
    formValues(fd),
  );
}

/** Signed copies and other files of a meeting; allowed for Draft and Approved meetings. */
export async function addMeetingAttachmentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { kind: formText(fd, "kind") };
  const file = await readFormFile(fd);
  if (typeof file === "string") return { error: file, values };
  return toState(
    await addAttachment(user, formText(fd, "projectId"), {
      entityType: MEETING_ENTITY,
      entityId: formText(fd, "meetingId"),
      kind: values.kind as AttachmentKind,
      ...file,
    }),
    values,
  );
}
