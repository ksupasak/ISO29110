import { Prisma, type ProjectRole, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { fail, ok, type ActionResult } from "@/lib/result";
import { parseInput } from "@/lib/validation";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const PRIMARY_NOT_IN_ROLES = "บทบาทหลักต้องอยู่ในบทบาทที่เลือก";
const NEED_PM = "โครงการต้องมี PM อย่างน้อย 1 คน";

export type MemberView = {
  id: string;
  userId: string;
  fullName: string;
  position: string | null;
  roles: ProjectRole[];
  primaryRole: ProjectRole;
  /** 2-decimal string, or null when unset or when the caller may not see rates. */
  dailyRate: string | null;
};

export type AssignableUser = { id: string; fullName: string; position: string | null };

const roleSchema = z.enum(["PM", "TL", "AN", "PR", "QA", "VIEWER"]);
const rolesSchema = z
  .array(roleSchema)
  .min(1, "กรุณาเลือกบทบาทอย่างน้อย 1 บทบาท")
  .transform((r) => [...new Set(r)]);
const rateSchema = z.number().nonnegative("อัตราต่อวันต้องไม่ติดลบ");

const baseSchema = z.object({ roles: rolesSchema, primaryRole: roleSchema });
const primaryInRoles = (v: { roles: ProjectRole[]; primaryRole: ProjectRole }) => v.roles.includes(v.primaryRole);

const addSchema = baseSchema
  .extend({ userId: z.string().min(1, "กรุณาเลือกผู้ใช้"), dailyRate: rateSchema.nullish().transform((v) => v ?? null) })
  .refine(primaryInRoles, { message: PRIMARY_NOT_IN_ROLES });
/** dailyRate: undefined = leave unchanged, null = clear. */
const updateSchema = baseSchema
  .extend({ dailyRate: rateSchema.nullish() })
  .refine(primaryInRoles, { message: PRIMARY_NOT_IN_ROLES });

export type AddMemberInput = z.input<typeof addSchema>;
export type UpdateMemberInput = z.input<typeof updateSchema>;

async function otherPmCount(projectId: string, excludeMemberId: string): Promise<number> {
  return prisma.projectMember.count({
    where: { projectId, id: { not: excludeMemberId }, roles: { has: "PM" } },
  });
}

export async function addMember(
  user: User,
  projectId: string,
  input: AddMemberInput,
): Promise<ActionResult<null>> {
  if (!can(await getActor(user, projectId), "member.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(addSchema, input);
  if (!parsed.ok) return parsed;
  const { userId, roles, primaryRole, dailyRate } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!target?.active) return fail("ไม่พบผู้ใช้ที่เลือก");
  try {
    await prisma.projectMember.create({ data: { projectId, userId, roles, primaryRole, dailyRate } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("ผู้ใช้นี้อยู่ในทีมแล้ว");
    }
    throw e;
  }
  return ok(null);
}

export async function updateMember(
  user: User,
  memberId: string,
  input: UpdateMemberInput,
): Promise<ActionResult<null>> {
  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { projectId: true, roles: true },
  });
  if (!member) return fail("ไม่พบสมาชิก");
  if (!can(await getActor(user, member.projectId), "member.manage")) return fail(FORBIDDEN);
  const parsed = parseInput(updateSchema, input);
  if (!parsed.ok) return parsed;
  const { roles, primaryRole, dailyRate } = parsed.data;

  if (member.roles.includes("PM") && !roles.includes("PM") && (await otherPmCount(member.projectId, memberId)) === 0) {
    return fail(NEED_PM);
  }
  await prisma.projectMember.update({
    where: { id: memberId },
    data: { roles, primaryRole, ...(dailyRate === undefined ? {} : { dailyRate }) },
  });
  return ok(null);
}

export async function removeMember(user: User, memberId: string): Promise<ActionResult<null>> {
  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    select: { projectId: true, roles: true },
  });
  if (!member) return fail("ไม่พบสมาชิก");
  if (!can(await getActor(user, member.projectId), "member.manage")) return fail(FORBIDDEN);
  if (member.roles.includes("PM") && (await otherPmCount(member.projectId, memberId)) === 0) {
    return fail(NEED_PM);
  }
  await prisma.projectMember.delete({ where: { id: memberId } });
  return ok(null);
}

/** Team of a project. Empty for callers who cannot view it; dailyRate only for those who may see rates. */
export async function listMembers(user: User, projectId: string): Promise<MemberView[]> {
  const actor = await getActor(user, projectId);
  if (!can(actor, "project.view")) return [];
  const showRate = can(actor, "member.viewRate");
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { fullName: true, position: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    fullName: m.user.fullName,
    position: m.user.position,
    roles: m.roles,
    primaryRole: m.primaryRole,
    dailyRate: showRate && m.dailyRate ? m.dailyRate.toFixed(2) : null,
  }));
}

/** Active users not yet in the project, for the "add member" picker. Only callers who can manage members. */
export async function listAssignableUsers(user: User, projectId: string): Promise<AssignableUser[]> {
  if (!can(await getActor(user, projectId), "member.manage")) return [];
  return prisma.user.findMany({
    where: { active: true, memberships: { none: { projectId } } },
    select: { id: true, fullName: true, position: true },
    orderBy: { fullName: "asc" },
  });
}
