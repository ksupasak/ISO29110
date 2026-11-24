import type { ProjectMember, ProjectRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";

export type Action =
  | "project.view"
  | "project.edit"
  | "member.manage"
  | "member.viewRate"
  | "document.upload"
  | "document.setStatus"
  | "document.baseline"
  | "attachment.add"
  | "plan.manage"
  | "trace.manage"
  | "requirement.approve"
  | "meeting.manage"
  | "meeting.approve";

/** `roles` null means the user is not a member of the project. */
export type Actor = {
  user: Pick<User, "id" | "systemRole">;
  roles: ProjectRole[] | null;
};

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const ALL_ROLES: readonly ProjectRole[] = ["PM", "TL", "AN", "PR", "QA", "VIEWER"];

/** Project roles allowed per action. ADMIN bypasses this table; non-members get nothing. */
const RULES: Record<Action, readonly ProjectRole[]> = {
  "project.view": ALL_ROLES,
  "project.edit": ["PM"],
  "member.manage": ["PM"],
  "member.viewRate": ["PM"],
  "document.upload": ["PM", "TL", "AN", "PR", "QA"],
  "document.setStatus": ["PM", "TL", "AN", "PR", "QA"],
  "document.baseline": ["PM", "TL"],
  "attachment.add": ["PM", "TL", "AN", "PR", "QA"],
  "plan.manage": ["PM"],
  "trace.manage": ["AN", "TL"],
  "requirement.approve": ["TL", "PM"],
  "meeting.manage": ["PM", "AN"],
  "meeting.approve": ["PM"],
};

export function can(actor: Actor, action: Action): boolean {
  if (actor.user.systemRole === "ADMIN") return true;
  if (actor.roles === null) return false;
  const allowed = RULES[action];
  return actor.roles.some((r) => allowed.includes(r));
}

/** PM/ADMIN, or the task's assignee while they are a member with a working role (not VIEWER only). */
export function canUpdateTaskProgress(actor: Actor, task: { assigneeId: string | null }): boolean {
  if (can(actor, "plan.manage")) return true;
  if (actor.roles === null || task.assigneeId === null || task.assigneeId !== actor.user.id) return false;
  return actor.roles.some((r) => r !== "VIEWER");
}

export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError(`Not allowed: ${action}`);
}

export async function getActor(user: Pick<User, "id" | "systemRole">, projectId: string): Promise<Actor> {
  const member: Pick<ProjectMember, "roles"> | null = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { roles: true },
  });
  return {
    user: { id: user.id, systemRole: user.systemRole },
    roles: member ? member.roles : null,
  };
}
