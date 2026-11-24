import { fail, ok, type ActionResult } from "@/lib/result";

/** "ลบไม่ได้: ถูกอ้างจาก T-003, T-007": the error for deleting an item that others still point at. */
export function inUse(codes: readonly string[]): ActionResult<never> {
  const list = codes.length > 0 ? [...codes].sort(naturalCompare).join(", ") : "รายการอื่น";
  return fail(`ลบไม่ได้: ถูกอ้างจาก ${list}`);
}

/** Order codes like T-2 before T-10 and M2 before M10. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

/** Postgres foreign-key violation raised by Prisma (P2003): a race lost against a concurrent link. */
export function isForeignKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2003";
}

/**
 * Runs a write and wraps its value. A foreign key (P2003) or missing-row (P2025) error means a referenced row
 * vanished after it was checked, so it is reported as "not found" rather than thrown.
 */
export async function writing<T>(
  run: () => Promise<T>,
  message = "ไม่พบรายการที่เลือกในโครงการนี้",
): Promise<ActionResult<T>> {
  try {
    return ok(await run());
  } catch (e) {
    const code = typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (isForeignKeyError(e) || code === "P2025") return fail(message);
    throw e;
  }
}
