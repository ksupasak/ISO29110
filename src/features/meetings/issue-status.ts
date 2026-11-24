import type { OpenIssueStatus, TaskStatus } from "@prisma/client";

/** Linked task decides (DONE = closed, anything else = open); without a task, the stored status. */
export function effectiveIssueStatus(item: {
  status: OpenIssueStatus;
  task: { status: TaskStatus } | null;
}): OpenIssueStatus {
  if (item.task) return item.task.status === "DONE" ? "CLOSED" : "OPEN";
  return item.status;
}
