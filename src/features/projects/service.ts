import { Prisma, type Project, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { fail, ok, type ActionResult } from "@/lib/result";
import { parseInput } from "@/lib/validation";
import { WP_CATALOG } from "@/lib/wp-catalog";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const DATE_ORDER = "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม";

export function normalizeProjectCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Create-time fields: absent or empty means "no value" (null). */
const createFields = {
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ"),
  shortName: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  customerName: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null),
  startDate: z.date().nullish().transform((v) => v ?? null),
  endDate: z.date().nullish().transform((v) => v ?? null),
  budget: z
    .number()
    .nonnegative("งบประมาณต้องไม่ติดลบ")
    .nullish()
    .transform((v) => v ?? null),
};

/** Update-time fields: undefined = leave unchanged; null or empty string = clear. */
const keep = <T>(v: T | null | undefined, empty: (x: T) => boolean = () => false) =>
  v === undefined ? undefined : v === null || empty(v) ? null : v;
const updateFields = {
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ").optional(),
  shortName: z.string().trim().nullish().transform((v) => keep(v, (x) => x === "")),
  customerName: z.string().trim().nullish().transform((v) => keep(v, (x) => x === "")),
  startDate: z.date().nullish().transform((v) => keep(v)),
  endDate: z.date().nullish().transform((v) => keep(v)),
  budget: z.number().nonnegative("งบประมาณต้องไม่ติดลบ").nullish().transform((v) => keep(v)),
};

const datesInOrder = (v: { startDate?: Date | null; endDate?: Date | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

const createSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeProjectCode)
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, "รหัสโครงการต้องยาว 3-30 ตัวอักษร ใช้ได้เฉพาะ A-Z 0-9 และ -")),
    pmUserId: z.string().min(1, "กรุณาเลือกผู้จัดการโครงการ"),
    ...createFields,
  })
  .refine(datesInOrder, { message: DATE_ORDER });

const updateSchema = z.object({ ...updateFields, status: z.enum(["PLANNING", "ACTIVE", "CLOSED"]).optional() });

export type CreateProjectInput = z.input<typeof createSchema>;
export type UpdateProjectInput = z.input<typeof updateSchema>;

export async function createProject(admin: User, input: CreateProjectInput): Promise<ActionResult<Project>> {
  if (admin.systemRole !== "ADMIN") return fail(FORBIDDEN);
  const parsed = parseInput(createSchema, input);
  if (!parsed.ok) return parsed;
  const { pmUserId, ...data } = parsed.data;

  const pm = await prisma.user.findUnique({ where: { id: pmUserId }, select: { active: true } });
  if (!pm?.active) return fail("ไม่พบผู้ใช้ที่เลือกเป็นผู้จัดการโครงการ");

  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({ data });
      await tx.projectMember.create({
        data: { projectId: created.id, userId: pmUserId, roles: ["PM"], primaryRole: "PM" },
      });
      await tx.wpDocument.createMany({
        data: WP_CATALOG.map((wp) => ({ projectId: created.id, wpCode: wp.code, status: "Draft" })),
      });
      return created;
    });
    return ok(project);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("รหัสโครงการนี้ถูกใช้แล้ว");
    }
    throw e;
  }
}

export async function updateProject(
  user: User,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ActionResult<Project>> {
  const actor = await getActor(user, projectId);
  if (!can(actor, "project.edit")) return fail(FORBIDDEN);
  const parsed = parseInput(updateSchema, input);
  if (!parsed.ok) return parsed;
  const stored = await prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, endDate: true } });
  if (!stored) return fail("ไม่พบโครงการ");
  // The date-order rule applies to the resulting values, not just the ones sent.
  const merged = {
    startDate: parsed.data.startDate === undefined ? stored.startDate : parsed.data.startDate,
    endDate: parsed.data.endDate === undefined ? stored.endDate : parsed.data.endDate,
  };
  if (!datesInOrder(merged)) return fail(DATE_ORDER);
  return ok(await prisma.project.update({ where: { id: projectId }, data: parsed.data }));
}

export async function listVisibleProjects(user: User): Promise<Project[]> {
  return prisma.project.findMany({
    where: user.systemRole === "ADMIN" ? {} : { members: { some: { userId: user.id } } },
    orderBy: { code: "asc" },
  });
}

export async function getProjectByCode(user: User, code: string): Promise<Project | null> {
  return prisma.project.findFirst({
    where: {
      code: normalizeProjectCode(code),
      ...(user.systemRole === "ADMIN" ? {} : { members: { some: { userId: user.id } } }),
    },
  });
}
