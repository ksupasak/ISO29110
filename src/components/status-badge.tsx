import type { MeetingStatus, OpenIssueStatus, ProjectRole, ProjectStatus, RequirementStatus, TaskStatus, UnitTestStatus } from "@prisma/client";
import {
  MEETING_STATUS_LABEL,
  OPEN_ISSUE_STATUS_LABEL,
  REQUIREMENT_STATUS_LABEL,
  ROLE_LABEL,
  STATUS_LABEL,
  TASK_STATUS_LABEL,
  UNIT_TEST_LABEL,
  docStatusVariant,
  meetingStatusVariant,
  openIssueStatusVariant,
  projectStatusVariant,
  requirementStatusVariant,
  taskStatusVariant,
  unitTestVariant,
} from "@/lib/labels";

/** Soft-tinted pill; `variant` is a Bootstrap colour name (or `primary`). */
export function StatusChip({ variant, children }: { variant: string; children: React.ReactNode }) {
  return <span className={`badge-status badge-status-${variant}`}>{children}</span>;
}

/** WP document status as a coloured chip (Draft grey, in-progress blue, final green, Rejected red). */
export function DocStatusBadge({ status }: { status: string }) {
  return <StatusChip variant={docStatusVariant(status)}>{status}</StatusChip>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusChip variant={projectStatusVariant(status)}>{STATUS_LABEL[status]}</StatusChip>;
}

/** Project role chip; the member's primary role is filled and keeps the "*" the team table's legend refers to. */
export function RoleBadge({ role, primary = false }: { role: ProjectRole; primary?: boolean }) {
  return (
    <span className={primary ? "badge-status badge-status-primary badge-status-emphasis" : "badge-status badge-status-primary"}>
      {ROLE_LABEL[role]}
      {primary && " *"}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <StatusChip variant={taskStatusVariant(status)}>{TASK_STATUS_LABEL[status]}</StatusChip>;
}

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  return <StatusChip variant={requirementStatusVariant(status)}>{REQUIREMENT_STATUS_LABEL[status]}</StatusChip>;
}

export function UnitTestBadge({ status }: { status: UnitTestStatus }) {
  return <StatusChip variant={unitTestVariant(status)}>{UNIT_TEST_LABEL[status]}</StatusChip>;
}

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  return <StatusChip variant={meetingStatusVariant(status)}>{MEETING_STATUS_LABEL[status]}</StatusChip>;
}

export function OpenIssueStatusBadge({ status }: { status: OpenIssueStatus }) {
  return <StatusChip variant={openIssueStatusVariant(status)}>{OPEN_ISSUE_STATUS_LABEL[status]}</StatusChip>;
}
