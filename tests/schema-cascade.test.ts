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
