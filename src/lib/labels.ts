import type { ProjectRole, ProjectStatus } from "@prisma/client";
import { isFinalStatus } from "@/lib/wp-catalog";

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

export const ATTACHMENT_KIND_LABEL = {
  SIGNED: "เอกสารลงนาม",
  EVIDENCE: "หลักฐาน",
  OTHER: "อื่น ๆ",
} as const;

/** Bootstrap colour for a WP document status: Draft grey, final green (Rejected red), anything in between blue. */
export function docStatusVariant(status: string): "secondary" | "info" | "success" | "danger" {
  if (status === "Draft") return "secondary";
  if (status === "Rejected") return "danger";
  return isFinalStatus(status) ? "success" : "info";
}

const PROJECT_STATUS_VARIANT = {
  PLANNING: "info",
  ACTIVE: "success",
  CLOSED: "secondary",
} as const satisfies Record<ProjectStatus, string>;

/** Bootstrap colour for a project status: planning blue, active green, closed grey. */
export function projectStatusVariant(status: ProjectStatus): (typeof PROJECT_STATUS_VARIANT)[ProjectStatus] {
  return PROJECT_STATUS_VARIANT[status];
}
