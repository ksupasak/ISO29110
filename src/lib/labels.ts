import type { ProjectRole, ProjectStatus } from "@prisma/client";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "วางแผน",
  ACTIVE: "ดำเนินการ",
  CLOSED: "ปิดโครงการ",
};

export const ROLE_LABEL: Record<ProjectRole, string> = {
  PM: "ผู้จัดการโครงการ",
  TL: "Technical Leader",
  AN: "นักวิเคราะห์",
  PR: "โปรแกรมเมอร์",
  QA: "ผู้ทดสอบ",
  VIEWER: "ผู้ดูข้อมูล",
};

export const ROLE_ORDER: readonly ProjectRole[] = ["PM", "TL", "AN", "PR", "QA", "VIEWER"];

/** 410000 -> "410,000.00 บาท". Accepts the 2-decimal strings the services return. */
export function formatBaht(amount: number | string): string {
  const n = Number(amount);
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}
