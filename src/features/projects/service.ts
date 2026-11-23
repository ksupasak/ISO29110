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

const optText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const fields = {
  name: z.string().trim().min(1, "กรุณากรอกชื่อโครงการ"),
  shortName: optText,
  customerName: optText,
  startDate: z.date().nullish().transform((v) => v ?? null),
  endDate: z.date().nullish().transform((v) => v ?? null),
  budget: z
    .number()
    .nonnegative("งบประมาณต้องไม่ติดลบ")
    .nullish()
    .transform((v) => v ?? null),
};

const datesInOrder = (v: { startDate: Date | null; endDate: Date | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;

const createSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeProjectCode)
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, "รหัสโครงการต้องยาว 3-30 ตัวอักษร ใช้ได้เฉพาะ A-Z 0-9 และ -")),
    pmUserId: z.string().min(1, "กรุณาเลือกผู้จัดการโครงการ"),
    ...fields,
  })
  .refine(datesInOrder, { message: DATE_ORDER });

const updateSchema = z
  .object({ ...fields, status: z.enum(["PLANNING", "ACTIVE", "CLOSED"]).optional() })
  .refine(datesInOrder, { message: DATE_ORDER });

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
