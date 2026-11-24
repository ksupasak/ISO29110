import { beforeEach, describe, expect, test } from "vitest";
import type { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { assertCan, can, canUpdateTaskProgress, ForbiddenError, getActor, type Action, type Actor } from "@/lib/authz";

const ACTIONS: Action[] = [
  "project.view",
  "project.edit",
  "member.manage",
  "member.viewRate",
  "document.upload",
  "document.setStatus",
  "document.baseline",
  "attachment.add",
  "plan.manage",
  "trace.manage",
  "requirement.approve",
  "meeting.manage",
  "meeting.approve",
];

function actor(systemRole: "ADMIN" | "USER", roles: ProjectRole[] | null): Actor {
  return { user: { id: "u", systemRole }, roles };
}

// Every expected value is written out by hand, in ACTIONS order:
// view, edit, manage, viewRate, upload, setStatus, baseline, attachment, plan, trace, approve, meeting, meetingApprove
const CASES: [string, Actor, boolean[]][] = [
  ["ADMIN", actor("ADMIN", null), [true, true, true, true, true, true, true, true, true, true, true, true, true]],
  ["non-member", actor("USER", null), [false, false, false, false, false, false, false, false, false, false, false, false, false]],
  ["PM", actor("USER", ["PM"]), [true, true, true, true, true, true, true, true, true, false, true, true, true]],
  ["TL", actor("USER", ["TL"]), [true, false, false, false, true, true, true, true, false, true, true, false, false]],
  ["AN", actor("USER", ["AN"]), [true, false, false, false, true, true, false, true, false, true, false, true, false]],
  ["PR", actor("USER", ["PR"]), [true, false, false, false, true, true, false, true, false, false, false, false, false]],
  ["QA", actor("USER", ["QA"]), [true, false, false, false, true, true, false, true, false, false, false, false, false]],
  ["VIEWER", actor("USER", ["VIEWER"]), [true, false, false, false, false, false, false, false, false, false, false, false, false]],
  ["PR+TL", actor("USER", ["PR", "TL"]), [true, false, false, false, true, true, true, true, false, true, true, false, false]],
];

describe.each(CASES)("can() for %s", (_name, a, expected) => {
  test.each(ACTIONS.map((act, i) => [act, expected[i]] as const))("%s -> %s", (act, want) => {
    expect(can(a, act)).toBe(want);
  });
});

test("assertCan throws ForbiddenError for VIEWER uploading, passes for PM", () => {
  expect(() => assertCan(actor("USER", ["VIEWER"]), "document.upload")).toThrow(ForbiddenError);
  expect(() => assertCan(actor("USER", ["PM"]), "document.upload")).not.toThrow();
});

describe("canUpdateTaskProgress", () => {
  const me = "me";
  const as = (systemRole: "ADMIN" | "USER", roles: ProjectRole[] | null): Actor => ({
    user: { id: me, systemRole },
    roles,
  });
  test("PM and ADMIN may update any task", () => {
    expect(canUpdateTaskProgress(as("USER", ["PM"]), { assigneeId: "other" })).toBe(true);
    expect(canUpdateTaskProgress(as("USER", ["PM"]), { assigneeId: null })).toBe(true);
    expect(canUpdateTaskProgress(as("ADMIN", null), { assigneeId: "other" })).toBe(true);
  });
  test("the assignee may update their own task", () => {
    expect(canUpdateTaskProgress(as("USER", ["PR"]), { assigneeId: me })).toBe(true);
    expect(canUpdateTaskProgress(as("USER", ["QA", "TL"]), { assigneeId: me })).toBe(true);
  });
  test("other members, unassigned tasks and non-members may not", () => {
    expect(canUpdateTaskProgress(as("USER", ["PR"]), { assigneeId: "other" })).toBe(false);
    expect(canUpdateTaskProgress(as("USER", ["TL"]), { assigneeId: null })).toBe(false);
    expect(canUpdateTaskProgress(as("USER", null), { assigneeId: me })).toBe(false);
  });
  test("a VIEWER-only assignee may not", () => {
    expect(canUpdateTaskProgress(as("USER", ["VIEWER"]), { assigneeId: me })).toBe(false);
  });
});

describe("getActor", () => {
  beforeEach(resetDb);

  test("member gets their roles; non-member gets null", async () => {
    const member = await prisma.user.create({ data: { username: "m", passwordHash: "x", fullName: "M" } });
    const outsider = await prisma.user.create({ data: { username: "o", passwordHash: "x", fullName: "O" } });
    const project = await prisma.project.create({ data: { code: "P1", name: "P1" } });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: member.id, roles: ["PR", "TL"], primaryRole: "PR" },
    });

    const a = await getActor(member, project.id);
    expect(a.user).toEqual({ id: member.id, systemRole: "USER" });
    expect(a.roles).toEqual(["PR", "TL"]);

    const b = await getActor(outsider, project.id);
    expect(b.roles).toBeNull();
  });
});
