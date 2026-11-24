import type { ProjectRole, ProjectStatus, RequirementStatus, RequirementType, TaskKind, TaskStatus, UnitTestStatus } from "@prisma/client";
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

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "ยังไม่เริ่ม",
  DOING: "กำลังทำ",
  DONE: "เสร็จ",
  BLOCKED: "ติดขัด",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  PLAN: "วางแผน",
  DEV: "พัฒนา",
  FIX: "แก้ไข",
  REVIEW: "ทบทวน",
};

const TASK_STATUS_VARIANT = {
  TODO: "secondary",
  DOING: "info",
  DONE: "success",
  BLOCKED: "danger",
} as const satisfies Record<TaskStatus, string>;

/** Bootstrap colour for a task status: to-do grey, doing blue, done green, blocked red. */
export function taskStatusVariant(status: TaskStatus): (typeof TASK_STATUS_VARIANT)[TaskStatus] {
  return TASK_STATUS_VARIANT[status];
}

export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  PROPOSED: "เสนอ",
  APPROVED: "อนุมัติ",
  DROPPED: "ยกเลิก",
};

export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  FUNCTIONAL: "Functional",
  NON_FUNCTIONAL: "Non-functional",
};

export const UNIT_TEST_LABEL: Record<UnitTestStatus, string> = {
  NOT_TESTED: "ยังไม่ทดสอบ",
  PASSED: "ผ่าน",
  FAILED: "ไม่ผ่าน",
};

const REQUIREMENT_STATUS_VARIANT = {
  PROPOSED: "info",
  APPROVED: "success",
  DROPPED: "secondary",
} as const satisfies Record<RequirementStatus, string>;

/** Bootstrap colour for a requirement status: proposed blue, approved green, dropped grey. */
export function requirementStatusVariant(status: RequirementStatus): (typeof REQUIREMENT_STATUS_VARIANT)[RequirementStatus] {
  return REQUIREMENT_STATUS_VARIANT[status];
}

const UNIT_TEST_VARIANT = {
  NOT_TESTED: "secondary",
  PASSED: "success",
  FAILED: "danger",
} as const satisfies Record<UnitTestStatus, string>;

/** Bootstrap colour for a unit-test status: untested grey, passed green, failed red. */
export function unitTestVariant(status: UnitTestStatus): (typeof UNIT_TEST_VARIANT)[UnitTestStatus] {
  return UNIT_TEST_VARIANT[status];
}
