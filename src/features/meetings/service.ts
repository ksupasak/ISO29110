import type {
  AttachmentKind,
  Meeting,
  MeetingAttendee,
  MeetingItem,
  MeetingItemKind,
  MeetingStatus,
  OpenIssueStatus,
  Prisma,
  Task,
  TaskStatus,
  User,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { inUse, naturalCompare, writing } from "@/lib/in-use";
import { ROLE_LABEL } from "@/lib/labels";
import { fail, ok, type ActionResult } from "@/lib/result";
import { nextCode } from "@/lib/sequence";
import { deleteFile, openFile, saveFile } from "@/lib/storage";
import { parseInput } from "@/lib/validation";
import { TemplateError } from "@/lib/docfill";
import { fillGenerated, loadTemplate, templateErrorText } from "@/features/docgen/registry";
import { effectiveIssueStatus } from "./issue-status";
import { meetingDocData, type MeetingDocSource } from "./wp07";

/** `Attachment.entityType` of files attached to a meeting (signed copies, the approved docx). */
export const MEETING_ENTITY = "meeting";

export const MEETING_ITEM_KINDS = ["ACCOMPLISHED", "ISSUE", "OPEN_ISSUE", "AGREEMENT"] as const;
export const OPEN_ISSUE_STATUSES = ["OPEN", "CLOSED"] as const;

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const LOCKED = "การประชุมที่อนุมัติแล้วแก้ไม่ได้";
const NO_MEETING = "ไม่พบการประชุม";
const NO_ATTENDEE = "ไม่พบผู้เข้าร่วม";
const NO_ITEM = "ไม่พบรายการ";
const OTHER_PROJECT = "ไม่พบรายการที่เลือกในโครงการนี้";
const NOT_OPEN_ISSUE = "ทำได้เฉพาะประเด็นค้าง";
const STATUS_FOLLOWS_TASK = "สถานะตาม Task ที่โยงอยู่";
const TIME_FORMAT = "เวลาต้องอยู่ในรูปแบบ HH:MM";
const TIME_ORDER = "เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม";
const ALREADY_APPROVED = "การประชุมนี้อนุมัติแล้ว";
const NOT_APPROVED = "การประชุมนี้ยังไม่ได้อนุมัติ";
const NO_FROZEN = "ไม่พบไฟล์ฉบับอนุมัติ";
const WP_CODE = "WP07";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ---------- views ----------

export type MeetingRow = {
  id: string;
  code: string;
  meetingDate: Date;
  topic: string;
  status: MeetingStatus;
};

export type MeetingAttendeeView = {
  id: string;
  order: number;
  userId: string | null;
  fullName: string;
  position: string | null;
  organization: string | null;
  projectRole: string | null;
  present: boolean;
};

export type MeetingItemView = {
  id: string;
  kind: MeetingItemKind;
  order: number;
  text: string;
  ownerId: string | null;
  /** The stored owner name, or the member's name when only `ownerId` is set. */
  ownerName: string | null;
  dueDate: Date | null;
  status: OpenIssueStatus;
  effectiveStatus: OpenIssueStatus;
  task: { id: string; code: string; title: string; status: TaskStatus } | null;
  carriedFrom: { itemId: string; meetingCode: string } | null;
};

export type MeetingDetail = Meeting & {
  previous: { id: string; code: string; meetingDate: Date } | null;
  approvedByName: string | null;
  attendees: MeetingAttendeeView[];
  /** ACCOMPLISHED, ISSUE, OPEN_ISSUE, AGREEMENT (template order), then by `order`. */
  items: MeetingItemView[];
  attachments: { id: string; kind: AttachmentKind; fileName: string; uploadedBy: string; createdAt: Date }[];
};

// ---------- schemas ----------

const optStr = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null);
const optId = z
  .string()
  .nullish()
  .transform((v) => v || null);
const optDate = z
  .date()
  .nullish()
  .transform((v) => v ?? null);
const optTime = z
  .string()
  .trim()
  .nullish()
  .transform((v) => v || null)
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), TIME_FORMAT);

const topic = z.string({ error: "กรุณากรอกหัวข้อการประชุม" }).trim().min(1, "กรุณากรอกหัวข้อการประชุม");
const meetingDate = z.date({ error: "กรุณาระบุวันที่ประชุม" });

const createSchema = z.object({ topic, meetingDate, previousId: optId });

/** Every header field except code and status; absent optional fields are cleared. */
const meetingSchema = z
  .object({
    topic,
    meetingDate,
    startTime: optTime,
    endTime: optTime,
    place: optStr,
    recorder: optStr,
    organizer: optStr,
    purpose: optStr,
    previousId: optId,
    previousNote: optStr,
    nextTopic: optStr,
    nextDate: optDate,
    nextStartTime: optTime,
    nextEndTime: optTime,
    nextPlace: optStr,
  })
  .refine((m) => !m.startTime || !m.endTime || m.endTime >= m.startTime, TIME_ORDER)
  .refine((m) => !m.nextStartTime || !m.nextEndTime || m.nextEndTime >= m.nextStartTime, TIME_ORDER);

const attendeeSchema = z.object({
  userId: optId,
  fullName: optStr,
  position: optStr,
  organization: optStr,
  projectRole: optStr,
  present: z.boolean().optional().default(true),
});

const kindSchema = z.enum(MEETING_ITEM_KINDS, { error: "ชนิดรายการไม่ถูกต้อง" });
const issueStatusSchema = z.enum(OPEN_ISSUE_STATUSES, { error: "สถานะไม่ถูกต้อง" });
const itemText = z.string({ error: "กรุณากรอกข้อความ" }).trim().min(1, "กรุณากรอกข้อความ");

/** Open-issue fields; for other kinds they are dropped. */
const issueFields = { ownerId: optId, ownerName: optStr, dueDate: optDate };

const addItemSchema = z.object({
  kind: kindSchema,
  text: itemText,
  ...issueFields,
  status: issueStatusSchema.optional(),
  taskId: optId,
});

/** Kind is fixed at creation (order is per kind); the task link changes through `linkIssueToTask`. */
const updateItemSchema = z.object({
  text: itemText,
  ...issueFields,
  /** undefined = unchanged */
  status: issueStatusSchema.optional(),
});

const createTaskSchema = z.object({
  title: z.string({ error: "กรุณากรอกชื่องาน" }).trim().min(1, "กรุณากรอกชื่องาน"),
  assigneeId: optId,
  plannedEnd: optDate,
});

export type CreateMeetingInput = z.input<typeof createSchema>;
export type MeetingInput = z.input<typeof meetingSchema>;
export type AttendeeInput = z.input<typeof attendeeSchema>;
export type ItemInput = z.input<typeof addItemSchema>;
export type UpdateItemInput = z.input<typeof updateItemSchema>;
export type CreateTaskFromIssueInput = z.input<typeof createTaskSchema>;

// ---------- helpers ----------

/** A rule broken inside a transaction: rolls it back and becomes a failed result. */
class Refusal extends Error {}

/** พ.ศ. of a plain date (stored at UTC midnight). */
export function buddhistYearOf(date: Date): number {
  return date.getUTCFullYear() + 543;
}

/**
 * Lock the meeting row for the rest of the transaction and refuse when it is approved, so a write cannot slip in
 * between an approval and its commit. Approval (Task 4) should take the same lock.
 */
export async function lockDraftMeeting(tx: Prisma.TransactionClient, meetingId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ status: MeetingStatus }[]>`
    SELECT "status" FROM "Meeting" WHERE "id" = ${meetingId} FOR UPDATE`;
  if (rows.length === 0) throw new Refusal(NO_MEETING);
  if (rows[0].status === "APPROVED") throw new Refusal(LOCKED);
}

/** Run `fn` in a transaction; Refusals become failures, FK races "not found". */
async function inTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<ActionResult<T>> {
  try {
    return await writing(() => prisma.$transaction(fn, options));
  } catch (e) {
    if (e instanceof Refusal) return fail(e.message);
    throw e;
  }
}

/** Run `fn` in a transaction holding the draft meeting's lock. */
async function onDraft<T>(
  meetingId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<ActionResult<T>> {
  return inTx(async (tx) => {
    await lockDraftMeeting(tx, meetingId);
    return fn(tx);
  });
}

function refuse(result: ActionResult<never>): never {
  throw new Refusal(result.ok ? "" : result.error);
}

async function canManage(user: User, projectId: string): Promise<boolean> {
  return can(await getActor(user, projectId), "meeting.manage");
}

async function memberOf(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { roles: true, primaryRole: true, user: { select: { fullName: true, position: true } } },
  });
}

/** The previous meeting must be another meeting of the project, and must not lead back to `selfId`. */
async function checkPrevious(
  db: Prisma.TransactionClient,
  projectId: string,
  previousId: string | null,
  selfId?: string,
): Promise<string | null> {
  if (!previousId) return null;
  const prev = await db.meeting.findUnique({ where: { id: previousId }, select: { projectId: true } });
  if (!prev || prev.projectId !== projectId) return OTHER_PROJECT;
  if (selfId) {
    const seen = new Set<string>();
    let cursor: string | null = previousId;
    while (cursor && !seen.has(cursor)) {
      if (cursor === selfId) return "การประชุมครั้งก่อนต้องไม่เป็นการประชุมนี้หรือครั้งที่ตามมา";
      seen.add(cursor);
      cursor = (await db.meeting.findUnique({ where: { id: cursor }, select: { previousId: true } }))?.previousId ?? null;
    }
  }
  return null;
}

/**
 * Serialises changes to the "previous meeting" chain of one project, so two concurrent edits cannot each pass the
 * loop check and together form a loop (A -> B and B -> A). Released at the end of the transaction.
 */
async function lockMeetingChain(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const key = `meeting-chain:${projectId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function taskInProject(projectId: string, taskId: string | null): Promise<boolean> {
  if (!taskId) return true;
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  return t?.projectId === projectId;
}

/** Owner fields of an open issue: a member owner fills in the name when none was typed. */
async function resolveOwner(
  projectId: string,
  input: { ownerId: string | null; ownerName: string | null; dueDate: Date | null },
): Promise<ActionResult<{ ownerId: string | null; ownerName: string | null; dueDate: Date | null }>> {
  if (!input.ownerId) return ok(input);
  const member = await memberOf(projectId, input.ownerId);
  if (!member) return fail("ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการ");
  return ok({ ...input, ownerName: input.ownerName ?? member.user.fullName });
}

const NON_ISSUE = { ownerId: null, ownerName: null, dueDate: null, status: "OPEN", taskId: null } as const;

async function nextOrder(
  tx: Prisma.TransactionClient,
  table: "attendee" | "item",
  meetingId: string,
  kind?: MeetingItemKind,
): Promise<number> {
  const agg =
    table === "attendee"
      ? await tx.meetingAttendee.aggregate({ where: { meetingId }, _max: { order: true } })
      : await tx.meetingItem.aggregate({ where: { meetingId, kind }, _max: { order: true } });
  return (agg._max.order ?? 0) + 1;
}

export { effectiveIssueStatus };

// ---------- meetings ----------

export async function createMeeting(
  user: User,
  projectId: string,
  input: CreateMeetingInput,
): Promise<ActionResult<Meeting>> {
  if (!(await canManage(user, projectId))) return fail(FORBIDDEN);
  const parsed = parseInput(createSchema, input);
  if (!parsed.ok) return parsed;
  const { previousId } = parsed.data;
  const prevError = await checkPrevious(prisma, projectId, previousId);
  if (prevError) return fail(prevError);
  return inTx(async (tx) => {
    if (previousId) {
      // Hold the previous meeting's row lock while copying: its item edits and deletion take the same lock, so the
      // copy sees a consistent set of issues and never points at an item deleted meanwhile.
      const prev = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Meeting" WHERE "id" = ${previousId} AND "projectId" = ${projectId} FOR UPDATE`;
      if (prev.length === 0) throw new Refusal("ไม่พบการประชุมครั้งก่อน อาจถูกลบไปแล้ว");
    }
    // Carry-forward: open issues (by effective status) of the previous meeting, copied once, here.
    const carried = previousId
      ? (
          await tx.meetingItem.findMany({
            where: { meetingId: previousId, kind: "OPEN_ISSUE" },
            include: { task: { select: { status: true } } },
            orderBy: { order: "asc" },
          })
        ).filter((i) => effectiveIssueStatus(i) === "OPEN")
      : [];
    const code = await nextCode(tx, projectId, "MR", buddhistYearOf(parsed.data.meetingDate));
    const meeting = await tx.meeting.create({ data: { projectId, code, ...parsed.data } });
    if (carried.length > 0) {
      await tx.meetingItem.createMany({
        data: carried.map((i, idx) => ({
          meetingId: meeting.id,
          projectId,
          kind: "OPEN_ISSUE" as const,
          order: idx + 1,
          text: i.text,
          ownerId: i.ownerId,
          ownerName: i.ownerName,
          dueDate: i.dueDate,
          status: "OPEN" as const,
          taskId: i.taskId,
          carriedFromId: i.id,
        })),
      });
    }
    return meeting;
  });
}

export async function updateMeeting(user: User, meetingId: string, input: MeetingInput): Promise<ActionResult<Meeting>> {
  const stored = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!stored) return fail(NO_MEETING);
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  if (stored.status === "APPROVED") return fail(LOCKED);
  const parsed = parseInput(meetingSchema, input);
  if (!parsed.ok) return parsed;
  const { previousId } = parsed.data;
  const prevError = await checkPrevious(prisma, stored.projectId, previousId, meetingId);
  if (prevError) return fail(prevError);
  return inTx(async (tx) => {
    // Chain lock first, then the row lock: every caller that takes both takes them in this order.
    if (previousId) await lockMeetingChain(tx, stored.projectId);
    await lockDraftMeeting(tx, meetingId);
    if (previousId) {
      const again = await checkPrevious(tx, stored.projectId, previousId, meetingId);
      if (again) throw new Refusal(again);
    }
    return tx.meeting.update({ where: { id: meetingId }, data: parsed.data });
  });
}

export async function deleteMeeting(user: User, meetingId: string): Promise<ActionResult<null>> {
  const stored = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!stored) return fail(NO_MEETING);
  if (!(await canManage(user, stored.projectId))) return fail(FORBIDDEN);
  if (stored.status === "APPROVED") return fail(LOCKED);
  let paths: string[] = [];
  const r = await onDraft(meetingId, async (tx) => {
    const [followers, carriers] = await Promise.all([
      tx.meeting.findMany({ where: { previousId: meetingId }, select: { code: true } }),
      tx.meetingItem.findMany({
        where: { carriedFrom: { meetingId }, meetingId: { not: meetingId } },
        select: { meeting: { select: { code: true } } },
      }),
    ]);
    const codes = [...new Set([...followers.map((m) => m.code), ...carriers.map((i) => i.meeting.code)])];
    if (codes.length > 0) refuse(inUse(codes));
    const attachments = await tx.attachment.findMany({
      where: { projectId: stored.projectId, entityType: MEETING_ENTITY, entityId: meetingId },
      select: { id: true, storedPath: true },
    });
    await tx.meeting.delete({ where: { id: meetingId } });
    await tx.attachment.deleteMany({ where: { id: { in: attachments.map((a) => a.id) } } });
    paths = attachments.map((a) => a.storedPath);
    return null;
  });
  if (r.ok) {
    for (const p of paths) {
      try {
        await deleteFile(p);
      } catch {
        // best effort: the rows are gone already
      }
    }
  }
  return r;
}

// ---------- attendees ----------

type AttendeeData = Omit<z.output<typeof attendeeSchema>, "fullName"> & { fullName: string };

/** A member attendee gets name, position and primary-role label filled in where none was typed. */
async function resolveAttendee(
  projectId: string,
  input: AttendeeInput,
  selfId?: string,
): Promise<ActionResult<AttendeeData>> {
  const parsed = parseInput(attendeeSchema, input);
  if (!parsed.ok) return parsed;
  const a = parsed.data;
  if (!a.userId) {
    if (!a.fullName) return fail("กรุณากรอกชื่อ-สกุล");
    return ok({ ...a, fullName: a.fullName });
  }
  const member = await memberOf(projectId, a.userId);
  if (!member) return fail("ผู้เข้าร่วมที่เลือกต้องเป็นสมาชิกของโครงการ");
  return ok({
    ...a,
    fullName: a.fullName ?? member.user.fullName,
    position: a.position ?? (selfId ? null : member.user.position),
    projectRole: a.projectRole ?? (selfId ? null : ROLE_LABEL[member.primaryRole]),
  });
}

/** A member is listed once per meeting. Call under the meeting lock so concurrent adds cannot both pass. */
async function refuseDuplicateMember(
  tx: Prisma.TransactionClient,
  meetingId: string,
  userId: string | null,
  selfId?: string,
): Promise<void> {
  if (!userId) return;
  const dup = await tx.meetingAttendee.findFirst({
    where: { meetingId, userId, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { id: true },
  });
  if (dup) throw new Refusal("ผู้เข้าร่วมนี้มีอยู่แล้ว");
}

export async function addAttendee(user: User, meetingId: string, input: AttendeeInput): Promise<ActionResult<MeetingAttendee>> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!m) return fail(NO_MEETING);
  if (!(await canManage(user, m.projectId))) return fail(FORBIDDEN);
  if (m.status === "APPROVED") return fail(LOCKED);
  const data = await resolveAttendee(m.projectId, input);
  if (!data.ok) return data;
  return onDraft(meetingId, async (tx) => {
    await refuseDuplicateMember(tx, meetingId, data.data.userId);
    return tx.meetingAttendee.create({
      data: { ...data.data, meetingId, projectId: m.projectId, order: await nextOrder(tx, "attendee", meetingId) },
    });
  });
}

export async function updateAttendee(
  user: User,
  attendeeId: string,
  input: AttendeeInput,
): Promise<ActionResult<MeetingAttendee>> {
  const a = await prisma.meetingAttendee.findUnique({
    where: { id: attendeeId },
    select: { meetingId: true, projectId: true, meeting: { select: { status: true } } },
  });
  if (!a) return fail(NO_ATTENDEE);
  if (!(await canManage(user, a.projectId))) return fail(FORBIDDEN);
  if (a.meeting.status === "APPROVED") return fail(LOCKED);
  const data = await resolveAttendee(a.projectId, input, attendeeId);
  if (!data.ok) return data;
  return onDraft(a.meetingId, async (tx) => {
    await refuseDuplicateMember(tx, a.meetingId, data.data.userId, attendeeId);
    return tx.meetingAttendee.update({ where: { id: attendeeId }, data: data.data });
  });
}

export async function removeAttendee(user: User, attendeeId: string): Promise<ActionResult<null>> {
  const a = await prisma.meetingAttendee.findUnique({
    where: { id: attendeeId },
    select: { meetingId: true, projectId: true, meeting: { select: { status: true } } },
  });
  if (!a) return fail(NO_ATTENDEE);
  if (!(await canManage(user, a.projectId))) return fail(FORBIDDEN);
  if (a.meeting.status === "APPROVED") return fail(LOCKED);
  return onDraft(a.meetingId, async (tx) => {
    await tx.meetingAttendee.delete({ where: { id: attendeeId } });
    return null;
  });
}

// ---------- items ----------

export async function addItem(user: User, meetingId: string, input: ItemInput): Promise<ActionResult<MeetingItem>> {
  const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!m) return fail(NO_MEETING);
  if (!(await canManage(user, m.projectId))) return fail(FORBIDDEN);
  if (m.status === "APPROVED") return fail(LOCKED);
  const parsed = parseInput(addItemSchema, input);
  if (!parsed.ok) return parsed;
  const { kind, text, ownerId, ownerName, dueDate, status, taskId } = parsed.data;
  let fields: Pick<MeetingItem, "ownerId" | "ownerName" | "dueDate" | "status" | "taskId"> = NON_ISSUE;
  if (kind === "OPEN_ISSUE") {
    const owner = await resolveOwner(m.projectId, { ownerId, ownerName, dueDate });
    if (!owner.ok) return owner;
    if (!(await taskInProject(m.projectId, taskId))) return fail(OTHER_PROJECT);
    fields = { ...owner.data, status: taskId ? "OPEN" : (status ?? "OPEN"), taskId };
  }
  return onDraft(meetingId, async (tx) =>
    tx.meetingItem.create({
      data: { meetingId, projectId: m.projectId, kind, text, ...fields, order: await nextOrder(tx, "item", meetingId, kind) },
    }),
  );
}

async function loadItem(itemId: string) {
  return prisma.meetingItem.findUnique({
    where: { id: itemId },
    select: {
      meetingId: true,
      projectId: true,
      kind: true,
      status: true,
      taskId: true,
      meeting: { select: { status: true } },
    },
  });
}

export async function updateItem(user: User, itemId: string, input: UpdateItemInput): Promise<ActionResult<MeetingItem>> {
  const item = await loadItem(itemId);
  if (!item) return fail(NO_ITEM);
  if (!(await canManage(user, item.projectId))) return fail(FORBIDDEN);
  if (item.meeting.status === "APPROVED") return fail(LOCKED);
  const parsed = parseInput(updateItemSchema, input);
  if (!parsed.ok) return parsed;
  const { text, ownerId, ownerName, dueDate, status } = parsed.data;
  let fields: Partial<Pick<MeetingItem, "ownerId" | "ownerName" | "dueDate" | "status">> = {};
  if (item.kind === "OPEN_ISSUE") {
    if (item.taskId && status !== undefined && status !== item.status) return fail(STATUS_FOLLOWS_TASK);
    const owner = await resolveOwner(item.projectId, { ownerId, ownerName, dueDate });
    if (!owner.ok) return owner;
    fields = { ...owner.data, ...(status !== undefined ? { status } : {}) };
  }
  return onDraft(item.meetingId, async (tx) => {
    // Re-check under the lock: a task may have been linked since the read above.
    if (fields.status !== undefined) {
      const now = await tx.meetingItem.findUniqueOrThrow({ where: { id: itemId }, select: { taskId: true, status: true } });
      if (now.taskId && fields.status !== now.status) throw new Refusal(STATUS_FOLLOWS_TASK);
    }
    return tx.meetingItem.update({ where: { id: itemId }, data: { text, ...fields } });
  });
}

export async function removeItem(user: User, itemId: string): Promise<ActionResult<null>> {
  const item = await loadItem(itemId);
  if (!item) return fail(NO_ITEM);
  if (!(await canManage(user, item.projectId))) return fail(FORBIDDEN);
  if (item.meeting.status === "APPROVED") return fail(LOCKED);
  return onDraft(item.meetingId, async (tx) => {
    const carriers = await tx.meetingItem.findMany({
      where: { carriedFromId: itemId },
      select: { meeting: { select: { code: true } } },
    });
    if (carriers.length > 0) refuse(inUse([...new Set(carriers.map((c) => c.meeting.code))]));
    await tx.meetingItem.delete({ where: { id: itemId } });
    return null;
  });
}

export async function linkIssueToTask(user: User, itemId: string, taskId: string | null): Promise<ActionResult<MeetingItem>> {
  const item = await loadItem(itemId);
  if (!item) return fail(NO_ITEM);
  if (!(await canManage(user, item.projectId))) return fail(FORBIDDEN);
  if (item.meeting.status === "APPROVED") return fail(LOCKED);
  if (item.kind !== "OPEN_ISSUE") return fail(NOT_OPEN_ISSUE);
  if (!(await taskInProject(item.projectId, taskId || null))) return fail(OTHER_PROJECT);
  return onDraft(item.meetingId, (tx) => tx.meetingItem.update({ where: { id: itemId }, data: { taskId: taskId || null } }));
}

export async function createTaskFromIssue(
  user: User,
  itemId: string,
  input: CreateTaskFromIssueInput,
): Promise<ActionResult<Task>> {
  const item = await loadItem(itemId);
  if (!item) return fail(NO_ITEM);
  if (!(await canManage(user, item.projectId))) return fail(FORBIDDEN);
  if (item.meeting.status === "APPROVED") return fail(LOCKED);
  if (item.kind !== "OPEN_ISSUE") return fail(NOT_OPEN_ISSUE);
  if (item.taskId) return fail("ประเด็นนี้โยงกับ Task แล้ว");
  const parsed = parseInput(createTaskSchema, input);
  if (!parsed.ok) return parsed;
  const { title, assigneeId, plannedEnd } = parsed.data;
  if (assigneeId) {
    const member = await memberOf(item.projectId, assigneeId);
    if (!member || !member.roles.some((r) => r !== "VIEWER")) {
      return fail("ผู้รับผิดชอบต้องเป็นสมาชิกของโครงการที่มีบทบาทปฏิบัติงาน");
    }
  }
  const projectId = item.projectId;
  return onDraft(item.meetingId, async (tx) => {
    const now = await tx.meetingItem.findUniqueOrThrow({ where: { id: itemId }, select: { taskId: true } });
    if (now.taskId) throw new Refusal("ประเด็นนี้โยงกับ Task แล้ว");
    const code = await nextCode(tx, projectId, "T");
    const task = await tx.task.create({
      data: { projectId, code, title, kind: "PLAN", status: "TODO", assigneeId, plannedEnd },
    });
    await tx.meetingItem.update({ where: { id: itemId }, data: { taskId: task.id } });
    return task;
  });
}

// ---------- reads ----------

/** Newest first (meeting date, then code). Empty for callers who cannot view the project. */
export async function listMeetings(user: User, projectId: string): Promise<MeetingRow[]> {
  if (!can(await getActor(user, projectId), "project.view")) return [];
  const rows = await prisma.meeting.findMany({
    where: { projectId },
    select: { id: true, code: true, meetingDate: true, topic: true, status: true },
  });
  return rows.sort((a, b) => b.meetingDate.getTime() - a.meetingDate.getTime() || naturalCompare(b.code, a.code));
}

const KIND_ORDER: Record<MeetingItemKind, number> = { ACCOMPLISHED: 0, ISSUE: 1, OPEN_ISSUE: 2, AGREEMENT: 3 };

export async function getMeeting(user: User, projectId: string, code: string): Promise<MeetingDetail | null> {
  if (!can(await getActor(user, projectId), "project.view")) return null;
  const m = await prisma.meeting.findUnique({
    where: { projectId_code: { projectId, code } },
    include: {
      previous: { select: { id: true, code: true, meetingDate: true } },
      approvedBy: { select: { fullName: true } },
      attendees: { orderBy: { order: "asc" } },
      items: {
        include: {
          owner: { select: { fullName: true } },
          task: { select: { id: true, code: true, title: true, status: true } },
          carriedFrom: { select: { id: true, meeting: { select: { code: true } } } },
        },
      },
    },
  });
  if (!m) return null;
  // The approved copy is the meeting's own output, not an upload: it is reached through export.
  const attachments = (
    await prisma.attachment.findMany({
      where: { projectId, entityType: MEETING_ENTITY, entityId: m.id },
      include: { uploadedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    })
  ).filter((a) => a.id !== m.approvedFileId);
  const { previous, approvedBy, attendees, items, ...header } = m;
  return {
    ...header,
    previous,
    approvedByName: approvedBy?.fullName ?? null,
    attendees: attendees.map((a) => ({
      id: a.id,
      order: a.order,
      userId: a.userId,
      fullName: a.fullName,
      position: a.position,
      organization: a.organization,
      projectRole: a.projectRole,
      present: a.present,
    })),
    items: items
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.order - b.order)
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        order: i.order,
        text: i.text,
        ownerId: i.ownerId,
        ownerName: i.ownerName ?? i.owner?.fullName ?? null,
        dueDate: i.dueDate,
        status: i.status,
        effectiveStatus: effectiveIssueStatus(i),
        task: i.task,
        carriedFrom: i.carriedFrom ? { itemId: i.carriedFrom.id, meetingCode: i.carriedFrom.meeting.code } : null,
      })),
    attachments: attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      uploadedBy: a.uploadedBy.fullName,
      createdAt: a.createdAt,
    })),
  };
}

/** Meeting issues linked to a task, for the task's reference panel. The caller checks the viewer's access. */
export async function listIssuesForTask(taskId: string): Promise<{ meetingCode: string; text: string }[]> {
  const rows = await prisma.meetingItem.findMany({
    where: { taskId },
    select: { text: true, order: true, meeting: { select: { code: true } } },
  });
  return rows
    .sort((a, b) => naturalCompare(a.meeting.code, b.meeting.code) || a.order - b.order)
    .map((r) => ({ meetingCode: r.meeting.code, text: r.text }));
}

// ---------- approve, revert, export ----------

/** Everything the WP07 document needs, read through `db` (inside the approval transaction, or plain). */
async function docSource(db: Prisma.TransactionClient, meetingId: string): Promise<MeetingDocSource | null> {
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    include: {
      project: { select: { name: true, code: true } },
      previous: { select: { code: true, meetingDate: true } },
      attendees: true,
      items: { include: { owner: { select: { fullName: true } }, task: { select: { code: true, status: true } } } },
    },
  });
  if (!m) return null;
  return {
    ...m,
    items: m.items.map((i) => ({ ...i, ownerName: i.ownerName ?? i.owner?.fullName ?? null })),
  };
}

const docFileName = (src: { code: string; project: { code: string } }) => `${src.project.code}_${src.code}.docx`;

/** Best-effort removal of a stored file: a failure here must never replace the original result. */
async function discardFile(storedPath: string): Promise<void> {
  try {
    await deleteFile(storedPath);
  } catch {
    // ignore
  }
}

/**
 * Freezes the meeting: fills WP07 with the meeting as Approved, stores it as an attachment of the meeting and sets
 * the approval fields. The data is read and the status changed inside one transaction holding the meeting row lock
 * (the same lock every mutation takes), so no change can land between the snapshot and the approval.
 */
export async function approveMeeting(user: User, meetingId: string): Promise<ActionResult<Meeting>> {
  const stored = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!stored) return fail(NO_MEETING);
  if (!can(await getActor(user, stored.projectId), "meeting.approve")) return fail(FORBIDDEN);
  if (stored.status === "APPROVED") return fail(ALREADY_APPROVED);
  let template: Buffer;
  try {
    template = await loadTemplate(WP_CODE);
  } catch (e) {
    if (e instanceof TemplateError) return fail(templateErrorText(WP_CODE, e));
    throw e;
  }
  let savedPath: string | null = null;
  try {
    const r = await inTx(
      async (tx) => {
        await lockDraftMeeting(tx, meetingId);
        const src = await docSource(tx, meetingId);
        if (!src) throw new Refusal(NO_MEETING);
        let data: Buffer;
        try {
          data = fillGenerated(WP_CODE, template, meetingDocData({ ...src, status: "APPROVED" }));
        } catch (e) {
          if (e instanceof TemplateError) throw new Refusal(templateErrorText(WP_CODE, e));
          throw e;
        }
        const fileName = docFileName(src);
        const saved = await saveFile(stored.projectId, fileName, data);
        savedPath = saved.storedPath;
        const attachment = await tx.attachment.create({
          data: {
            projectId: stored.projectId,
            entityType: MEETING_ENTITY,
            entityId: meetingId,
            kind: "OTHER",
            fileName,
            storedPath: saved.storedPath,
            size: saved.size,
            mime: DOCX_MIME,
            uploadedById: user.id,
          },
        });
        return tx.meeting.update({
          where: { id: meetingId },
          data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, approvedFileId: attachment.id },
        });
      },
      { timeout: 20_000 },
    );
    if (!r.ok && savedPath) await discardFile(savedPath);
    return r;
  } catch (e) {
    if (savedPath) await discardFile(savedPath);
    throw e;
  }
}

/** Back to Draft: clears the approval fields and removes the frozen copy (row and file). */
export async function revertMeeting(user: User, meetingId: string): Promise<ActionResult<Meeting>> {
  const stored = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, status: true } });
  if (!stored) return fail(NO_MEETING);
  if (!can(await getActor(user, stored.projectId), "meeting.approve")) return fail(FORBIDDEN);
  if (stored.status !== "APPROVED") return fail(NOT_APPROVED);
  let removedPath: string | null = null;
  const r = await inTx(async (tx) => {
    const rows = await tx.$queryRaw<{ status: MeetingStatus; approvedFileId: string | null }[]>`
      SELECT "status", "approvedFileId" FROM "Meeting" WHERE "id" = ${meetingId} FOR UPDATE`;
    if (rows.length === 0) throw new Refusal(NO_MEETING);
    if (rows[0].status !== "APPROVED") throw new Refusal(NOT_APPROVED);
    const meeting = await tx.meeting.update({
      where: { id: meetingId },
      data: { status: "DRAFT", approvedAt: null, approvedById: null, approvedFileId: null },
    });
    const fileId = rows[0].approvedFileId;
    if (fileId) {
      const frozen = await tx.attachment.findUnique({ where: { id: fileId }, select: { storedPath: true } });
      if (frozen) {
        await tx.attachment.delete({ where: { id: fileId } });
        removedPath = frozen.storedPath;
      }
    }
    return meeting;
  });
  if (r.ok && removedPath) await discardFile(removedPath);
  return r;
}

/**
 * The WP07 docx of a meeting: an Approved meeting gives its frozen copy byte for byte; a Draft is filled now.
 * A template problem fails with Thai text naming WP07 and the cause.
 */
export async function exportMeeting(
  user: User,
  meetingId: string,
): Promise<ActionResult<{ fileName: string; data: Buffer }>> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { projectId: true, status: true, approvedFile: { select: { fileName: true, storedPath: true } } },
  });
  if (!m) return fail(NO_MEETING);
  if (!can(await getActor(user, m.projectId), "project.view")) return fail(FORBIDDEN);
  if (m.status === "APPROVED") {
    if (!m.approvedFile) return fail(NO_FROZEN);
    try {
      return ok({ fileName: m.approvedFile.fileName, data: await openFile(m.approvedFile.storedPath) });
    } catch {
      return fail(NO_FROZEN);
    }
  }
  const src = await docSource(prisma, meetingId);
  if (!src) return fail(NO_MEETING);
  try {
    const data = fillGenerated(WP_CODE, await loadTemplate(WP_CODE), meetingDocData(src));
    return ok({ fileName: docFileName(src), data });
  } catch (e) {
    if (e instanceof TemplateError) return fail(templateErrorText(WP_CODE, e));
    throw e;
  }
}
