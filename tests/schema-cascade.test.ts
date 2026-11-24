import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";

beforeEach(async () => {
  await resetDb();
});

test("deleting a project removes members, documents, versions and attachments", async () => {
  const user = await prisma.user.create({
    data: { username: "u1", passwordHash: "x", fullName: "U One" },
  });
  const project = await prisma.project.create({ data: { code: "P1", name: "Project 1" } });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, roles: ["PM"], primaryRole: "PM" },
  });
  const doc = await prisma.wpDocument.create({ data: { projectId: project.id, wpCode: "WP02" } });
  const att = await prisma.attachment.create({
    data: {
      projectId: project.id,
      entityType: "WP",
      entityId: doc.id,
      fileName: "a.pdf",
      storedPath: "x/y",
      size: 1,
      mime: "application/pdf",
      uploadedById: user.id,
    },
  });
  await prisma.documentVersion.create({
    data: { wpDocumentId: doc.id, version: "1.0", attachmentId: att.id, uploadedById: user.id },
  });

  await prisma.project.delete({ where: { id: project.id } });

  expect(await prisma.projectMember.count()).toBe(0);
  expect(await prisma.wpDocument.count()).toBe(0);
  expect(await prisma.documentVersion.count()).toBe(0);
  expect(await prisma.attachment.count()).toBe(0);
  expect(await prisma.user.count()).toBe(1);
});

test("deleting a project removes its plan, trace and sequence rows", async () => {
  const user = await prisma.user.create({ data: { username: "u2", passwordHash: "x", fullName: "U Two" } });
  const project = await prisma.project.create({ data: { code: "P2", name: "Project 2" } });
  const projectId = project.id;
  const milestone = await prisma.milestone.create({ data: { projectId, code: "M1", name: "m" } });
  const parent = await prisma.task.create({
    data: { projectId, code: "T-001", title: "parent", assigneeId: user.id, milestoneId: milestone.id },
  });
  const child = await prisma.task.create({ data: { projectId, code: "T-002", title: "child", parentId: parent.id } });
  const ag = await prisma.agreementItem.create({ data: { projectId, code: "AG-01", text: "t" } });
  const req = await prisma.requirement.create({
    data: { projectId, code: "REQ-F01", type: "FUNCTIONAL", text: "t", agreementItemId: ag.id },
  });
  const comp = await prisma.component.create({ data: { projectId, code: "C01", name: "c", ownerId: user.id } });
  await prisma.taskRequirement.create({ data: { projectId, taskId: child.id, requirementId: req.id } });
  await prisma.taskComponent.create({ data: { projectId, taskId: child.id, componentId: comp.id } });
  await prisma.requirementComponent.create({ data: { projectId, requirementId: req.id, componentId: comp.id } });
  await prisma.docSequence.create({ data: { projectId, prefix: "T", lastNo: 2 } });

  await prisma.project.delete({ where: { id: projectId } });

  expect(await prisma.milestone.count()).toBe(0);
  expect(await prisma.task.count()).toBe(0);
  expect(await prisma.agreementItem.count()).toBe(0);
  expect(await prisma.requirement.count()).toBe(0);
  expect(await prisma.component.count()).toBe(0);
  expect(await prisma.taskRequirement.count()).toBe(0);
  expect(await prisma.taskComponent.count()).toBe(0);
  expect(await prisma.requirementComponent.count()).toBe(0);
  expect(await prisma.docSequence.count()).toBe(0);
  expect(await prisma.user.count()).toBe(1);
});

test("deleting a project removes its meetings, attendees and items (carried and task-linked)", async () => {
  const user = await prisma.user.create({ data: { username: "u3", passwordHash: "x", fullName: "U Three" } });
  const project = await prisma.project.create({ data: { code: "P3", name: "Project 3" } });
  const projectId = project.id;
  const day = new Date("2026-12-01T00:00:00.000Z");
  const task = await prisma.task.create({ data: { projectId, code: "T-001", title: "t" } });
  const first = await prisma.meeting.create({ data: { projectId, code: "MR-2569-01", topic: "a", meetingDate: day } });
  const att = await prisma.attachment.create({
    data: {
      projectId,
      entityType: "meeting",
      entityId: first.id,
      fileName: "mr.docx",
      storedPath: "x/y",
      size: 1,
      mime: "application/octet-stream",
      uploadedById: user.id,
    },
  });
  await prisma.meeting.update({
    where: { id: first.id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, approvedFileId: att.id },
  });
  const second = await prisma.meeting.create({
    data: { projectId, code: "MR-2569-02", topic: "b", meetingDate: day, previousId: first.id },
  });
  await prisma.meetingAttendee.create({ data: { meetingId: first.id, projectId, order: 1, userId: user.id, fullName: "U" } });
  const issue = await prisma.meetingItem.create({
    data: { meetingId: first.id, projectId, kind: "OPEN_ISSUE", order: 1, text: "i", ownerId: user.id, taskId: task.id },
  });
  await prisma.meetingItem.create({
    data: { meetingId: second.id, projectId, kind: "OPEN_ISSUE", order: 1, text: "i", taskId: task.id, carriedFromId: issue.id },
  });

  await prisma.project.delete({ where: { id: projectId } });

  expect(await prisma.meeting.count()).toBe(0);
  expect(await prisma.meetingAttendee.count()).toBe(0);
  expect(await prisma.meetingItem.count()).toBe(0);
  expect(await prisma.task.count()).toBe(0);
  expect(await prisma.attachment.count()).toBe(0);
  expect(await prisma.user.count()).toBe(1);
});

test("deleting a meeting removes its attendees and items but keeps the linked task", async () => {
  const project = await prisma.project.create({ data: { code: "P4", name: "Project 4" } });
  const projectId = project.id;
  const task = await prisma.task.create({ data: { projectId, code: "T-001", title: "t" } });
  const m = await prisma.meeting.create({
    data: { projectId, code: "MR-2569-01", topic: "a", meetingDate: new Date("2026-12-01T00:00:00.000Z") },
  });
  await prisma.meetingAttendee.create({ data: { meetingId: m.id, projectId, order: 1, fullName: "X" } });
  await prisma.meetingItem.create({ data: { meetingId: m.id, projectId, kind: "OPEN_ISSUE", order: 1, text: "i", taskId: task.id } });

  await prisma.meeting.delete({ where: { id: m.id } });

  expect(await prisma.meetingAttendee.count()).toBe(0);
  expect(await prisma.meetingItem.count()).toBe(0);
  expect(await prisma.task.count()).toBe(1);
});
