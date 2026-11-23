import type { ZodType } from "zod";
import { fail, type ActionResult } from "@/lib/result";

/** Parse with zod; on failure return the first issue's (Thai) message as a failed ActionResult. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): ActionResult<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return fail(r.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
}
