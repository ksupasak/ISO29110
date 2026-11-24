import { fail, type ActionResult } from "@/lib/result";

export const DEFAULT_TIMEOUT_MS = 15_000;

export const MSG = {
  timeout: "เชื่อมต่อไม่สำเร็จ: หมดเวลา",
  auth: "API key ไม่ถูกต้องหรือไม่มีสิทธิ์",
  notFound: "ไม่พบ model หรือ URL ปลายทางไม่ถูกต้อง",
  rateLimited: "ถูกจำกัดอัตราการใช้งาน กรุณาลองใหม่",
  refusal: "model ปฏิเสธคำขอ",
  badBody: "ผู้ให้บริการตอบข้อมูลในรูปแบบที่ไม่รองรับ",
} as const;

export const unreachable = (host: string) => `เชื่อมต่อไม่สำเร็จ: ติดต่อ ${host} ไม่ได้`;

/** Thai message for an HTTP status. Never includes the response body (it may echo credentials). */
export function statusError(status: number): ActionResult<never> {
  if (status === 401 || status === 403) return fail(MSG.auth);
  if (status === 404) return fail(MSG.notFound);
  if (status === 429) return fail(MSG.rateLimited);
  return fail(`ผู้ให้บริการตอบข้อผิดพลาด (${status})`);
}

/** The host (with port) of a URL for error messages; the raw input when it does not parse. */
export function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
