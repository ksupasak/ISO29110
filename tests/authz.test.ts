import { beforeEach, describe, expect, test } from "vitest";
import type { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { assertCan, can, ForbiddenError, getActor, type Action, type Actor } from "@/lib/authz";

const ACTIONS: Action[] = [
  "project.view",
  "project.edit",
  "member.manage",
  "member.viewRate",
  "document.upload",
  "document.setStatus",
  "document.baseline",
  "attachment.add",
];

function actor(systemRole: "ADMIN" | "USER", roles: ProjectRole[] | null): Actor {
  return { user: { id: "u", systemRole }, roles };
}

// Every expected value is written out by hand, in ACTIONS order:
// view, edit, manage, viewRate, upload, setStatus, baseline, attachment
const CASES: [string, Actor, boolean[]][] = [
  ["ADMIN", actor("ADMIN", null), [true, true, true, true, true, true, true, true]],
  ["non-member", actor("USER", null), [false, false, false, false, false, false, false, false]],
  ["PM", actor("USER", ["PM"]), [true, true, true, true, true, true, true, true]],
  ["TL", actor("USER", ["TL"]), [true, false, false, false, true, true, true, true]],
  ["AN", actor("USER", ["AN"]), [true, false, false, false, true, true, false, true]],
  ["PR", actor("USER", ["PR"]), [true, false, false, false, true, true, false, true]],
  ["QA", actor("USER", ["QA"]), [true, false, false, false, true, true, false, true]],
  ["VIEWER", actor("USER", ["VIEWER"]), [true, false, false, false, false, false, false, false]],
  ["PR+TL", actor("USER", ["PR", "TL"]), [true, false, false, false, true, true, true, true]],
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
