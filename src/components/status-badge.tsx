import type { ProjectRole, ProjectStatus } from "@prisma/client";
import { ROLE_LABEL, STATUS_LABEL, docStatusVariant, projectStatusVariant } from "@/lib/labels";

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
