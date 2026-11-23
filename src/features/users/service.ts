import { Prisma, type SystemRole, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { fail, ok, type ActionResult } from "@/lib/result";
import { parseInput } from "@/lib/validation";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";

/** User fields safe to show in the UI. Never includes passwordHash. */
export type UserSummary = {
  id: string;
  username: string;
  fullName: string;
  position: string | null;
  systemRole: SystemRole;
  active: boolean;
};

const SUMMARY_SELECT = {
  id: true,
  username: true,
  fullName: true,
  position: true,
  systemRole: true,
  active: true,
} as const;

const passwordSchema = z.string().min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
const fullNameSchema = z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุล");
const positionSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));
const systemRoleSchema = z.enum(["ADMIN", "USER"]);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]{3,32}$/, "ชื่อผู้ใช้ต้องยาว 3-32 ตัวอักษร ใช้ได้เฉพาะ a-z 0-9 . _ -"),
  fullName: fullNameSchema,
  position: positionSchema,
  password: passwordSchema,
  systemRole: systemRoleSchema,
});
const updateSchema = z.object({ fullName: fullNameSchema, position: positionSchema, systemRole: systemRoleSchema });

export type CreateUserInput = z.input<typeof createSchema>;
export type UpdateUserInput = z.input<typeof updateSchema>;

function isAdmin(user: Pick<User, "systemRole">): boolean {
  return user.systemRole === "ADMIN";
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createUser(admin: User, input: CreateUserInput): Promise<ActionResult<UserSummary>> {
  if (!isAdmin(admin)) return fail(FORBIDDEN);
  const parsed = parseInput(createSchema, input);
  if (!parsed.ok) return parsed;
  const { password, ...rest } = parsed.data;
  try {
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: SUMMARY_SELECT,
    });
    return ok(user);
  } catch (e) {
    if (isUniqueViolation(e)) return fail("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    throw e;
  }
}

export async function updateUser(admin: User, id: string, input: UpdateUserInput): Promise<ActionResult<UserSummary>> {
  if (!isAdmin(admin)) return fail(FORBIDDEN);
  const parsed = parseInput(updateSchema, input);
  if (!parsed.ok) return parsed;
  if (id === admin.id && parsed.data.systemRole !== admin.systemRole) {
    return fail("ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้");
  }
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail("ไม่พบผู้ใช้");
  return ok(await prisma.user.update({ where: { id }, data: parsed.data, select: SUMMARY_SELECT }));
}

export async function setUserActive(admin: User, id: string, active: boolean): Promise<ActionResult<UserSummary>> {
  if (!isAdmin(admin)) return fail(FORBIDDEN);
  if (id === admin.id && !active) return fail("ไม่สามารถปิดบัญชีของตนเองได้");
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail("ไม่พบผู้ใช้");
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { active }, select: SUMMARY_SELECT }),
    // Deactivation takes effect immediately: drop any live sessions.
    ...(active ? [] : [prisma.session.deleteMany({ where: { userId: id } })]),
  ]);
  return ok(user);
}

export async function resetPassword(admin: User, id: string, password: string): Promise<ActionResult<null>> {
  if (!isAdmin(admin)) return fail(FORBIDDEN);
  const parsed = parseInput(passwordSchema, password);
  if (!parsed.ok) return parsed;
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail("ไม่พบผู้ใช้");
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(parsed.data) } }),
    // Existing logins stop working once the password changes.
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  return ok(null);
}

export async function listUsers(admin: User): Promise<ActionResult<UserSummary[]>> {
  if (!isAdmin(admin)) return fail(FORBIDDEN);
  return ok(await prisma.user.findMany({ select: SUMMARY_SELECT, orderBy: { username: "asc" } }));
}
