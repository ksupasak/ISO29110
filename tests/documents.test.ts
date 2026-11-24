import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProjectRole, SystemRole, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb, countStoredFiles } from "./setup/db";
import { createProject } from "@/features/projects/service";
import { addAttachment, compareVersions, listDocuments, setDocumentStatus, uploadVersion } from "@/features/documents/service";
import { MAX_FILE_BYTES } from "@/lib/storage";
import { WP_CATALOG } from "@/lib/wp-catalog";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { GET } from "@/app/api/files/[id]/route";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let n = 0;
function mkUser(systemRole: SystemRole = "USER"): Promise<User> {
  n += 1;
  return prisma.user.create({ data: { username: `d${n}`, passwordHash: "x", fullName: `Doc User ${n}`, systemRole } });
}

let admin: User, pm: User, tl: User, analyst: User, viewer: User, outsider: User;
let project: { id: string };

async function join(user: User, role: ProjectRole) {
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, roles: [role], primaryRole: role } });
}

beforeEach(async () => {
  await resetDb();
  [admin, pm, tl, analyst, viewer, outsider] = [
    await mkUser("ADMIN"), await mkUser(), await mkUser(), await mkUser(), await mkUser(), await mkUser(),
  ];
  const r = await createProject(admin, { code: "DOC-001", name: "Docs", pmUserId: pm.id });
  if (!r.ok) throw new Error(r.error);
  project = r.data;
  await join(tl, "TL");
  await join(analyst, "AN");
  await join(viewer, "VIEWER");
});

const up = (o: object = {}, user: User = pm) =>
  uploadVersion(user, project.id, "WP10", { version: "1.0", fileName: "a.docx", mime: DOCX, data: Buffer.from("a"), ...o });

describe("uploadVersion", () => {
  test("upload creates version 1.0 and sets current version", async () => {
    const r = await uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "แผน.docx", mime: DOCX, data: Buffer.from("a") });
    expect(r.ok).toBe(true);
    const d = await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: "WP10" } } });
    expect(d.currentVersion).toBe("1.0");
    const att = await prisma.attachment.findFirstOrThrow({ where: { projectId: project.id } });
    expect(att).toMatchObject({ entityType: "WpDocument", entityId: d.id, kind: "OTHER", fileName: "แผน.docx", size: 1, uploadedById: pm.id });
  });

  test("current version is the highest uploaded, compared numerically", async () => {
    const cur = async (wp: string) =>
      (await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: wp } } })).currentVersion;
    await up({ version: "2.0" });
    await up({ version: "1.1" });
    expect(await cur("WP10")).toBe("2.0");
    const other = (v: string) => uploadVersion(pm, project.id, "WP02", { version: v, fileName: "a.docx", mime: DOCX, data: Buffer.from("a") });
    await other("1.9");
    await other("1.10");
    expect(await cur("WP02")).toBe("1.10");
  });

  test("duplicate version rejected and leaves no orphan file", async () => {
    await up();
    const before = await countStoredFiles(project.id);
    const r = await up({ fileName: "b.docx", data: Buffer.from("b") });
    expect(r).toEqual({ ok: false, error: "เวอร์ชันนี้มีอยู่แล้ว" });
    expect(await countStoredFiles(project.id)).toBe(before);
  });

  test("a failed DB write removes the stored file", async () => {
    const d = await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: "WP10" } } });
    // simulate a race: the version appears between the pre-check and the insert
    const spy = vi.spyOn(prisma.documentVersion, "findUnique").mockResolvedValue(null as never);
    try {
      await up();
      const before = await countStoredFiles(project.id);
      const r = await up({ fileName: "b.docx" });
      expect(r).toEqual({ ok: false, error: "เวอร์ชันนี้มีอยู่แล้ว" });
      expect(await countStoredFiles(project.id)).toBe(before);
      expect(await prisma.documentVersion.count({ where: { wpDocumentId: d.id } })).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("bad version, empty and oversize files rejected", async () => {
    expect(await up({ version: "v1" })).toEqual({ ok: false, error: "รูปแบบเวอร์ชันไม่ถูกต้อง เช่น 1.0" });
    expect(await up({ data: Buffer.alloc(0) })).toEqual({ ok: false, error: "ไฟล์ว่างเปล่า" });
    expect(await up({ data: Buffer.alloc(MAX_FILE_BYTES + 1) })).toEqual({ ok: false, error: "ไฟล์ใหญ่เกิน 50 MB" });
    expect(await countStoredFiles(project.id)).toBe(0);
  });

  test("unknown WP code fails instead of throwing", async () => {
    const r = await uploadVersion(pm, project.id, "WP99", { version: "1.0", fileName: "a.docx", mime: DOCX, data: Buffer.from("a") });
    expect(r.ok).toBe(false);
  });

  test("viewers and outsiders cannot upload; admin can", async () => {
    const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
    expect(await up({ version: "2.0" }, viewer)).toEqual(denied);
    expect(await up({ version: "2.0" }, outsider)).toEqual(denied);
    expect((await up({ version: "2.0" }, admin)).ok).toBe(true);
    expect(await countStoredFiles(project.id)).toBe(1);
  });
});

describe("setDocumentStatus", () => {
  test("only PM/TL can baseline; status must belong to the WP", async () => {
    expect((await setDocumentStatus(analyst, project.id, "WP13", "Verified")).ok).toBe(true);
    expect((await setDocumentStatus(analyst, project.id, "WP13", "Baselined")).ok).toBe(false);
    expect((await setDocumentStatus(tl, project.id, "WP13", "Baselined")).ok).toBe(true);
    expect((await setDocumentStatus(pm, project.id, "WP13", "Published")).ok).toBe(false);
    expect((await setDocumentStatus(pm, project.id, "WP13", "Draft")).ok).toBe(true);
    expect((await setDocumentStatus(viewer, project.id, "WP13", "Verified")).ok).toBe(false);
    expect((await setDocumentStatus(pm, project.id, "WP99", "Draft")).ok).toBe(false);
    const d = await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: "WP13" } } });
    expect(d.status).toBe("Draft");
  });
});

describe("setDocumentStatus final statuses", () => {
  const statusOf = async (wp: string) =>
    (await prisma.wpDocument.findUniqueOrThrow({ where: { projectId_wpCode: { projectId: project.id, wpCode: wp } } })).status;

  test("analyst cannot set a final status; PM can", async () => {
    for (const [wp, status] of [["WP10", "Accepted"], ["WP01", "Signed"], ["WP16", "Approved"], ["WP13", "Baselined"]] as const) {
      expect((await setDocumentStatus(analyst, project.id, wp, status)).ok).toBe(false);
      expect(await statusOf(wp)).toBe("Draft");
      expect((await setDocumentStatus(pm, project.id, wp, status)).ok).toBe(true);
      expect(await statusOf(wp)).toBe(status);
    }
  });

  test("a final status cannot be undone by an analyst, but PM can", async () => {
    expect((await setDocumentStatus(analyst, project.id, "WP13", "Verified")).ok).toBe(true);
    expect((await setDocumentStatus(tl, project.id, "WP13", "Baselined")).ok).toBe(true);
    expect((await setDocumentStatus(analyst, project.id, "WP13", "Draft")).ok).toBe(false);
    expect((await setDocumentStatus(analyst, project.id, "WP13", "Verified")).ok).toBe(false);
    expect(await statusOf("WP13")).toBe("Baselined");
    expect((await setDocumentStatus(pm, project.id, "WP13", "Draft")).ok).toBe(true);
    expect(await statusOf("WP13")).toBe("Draft");
  });
});

describe("listDocuments", () => {
  test("groups 23 WPs into 9 phases in catalogue order", async () => {
    const v = await listDocuments(pm, project.id);
    expect(v.map((p) => p.phase.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(v.flatMap((p) => p.items.map((i) => i.wp.code))).toEqual(WP_CATALOG.map((w) => w.code));
  });

  test("includes versions and attachments with uploader display names; outsiders get nothing", async () => {
    await up();
    const doc = await prisma.wpDocument.findFirstOrThrow({ where: { projectId: project.id, wpCode: "WP10" } });
    await addAttachment(pm, project.id, { entityType: "WpDocument", entityId: doc.id, kind: "SIGNED", fileName: "s.pdf", mime: "application/pdf", data: Buffer.from("p") });
    const item = (await listDocuments(viewer, project.id)).flatMap((p) => p.items).find((i) => i.wp.code === "WP10")!;
    expect(item.currentVersion).toBe("1.0");
    expect(item.versions).toHaveLength(1);
    expect(item.versions[0]).toMatchObject({ version: "1.0", fileName: "a.docx", uploadedBy: pm.fullName });
    expect(item.attachments).toHaveLength(1);
    expect(item.attachments[0]).toMatchObject({ kind: "SIGNED", fileName: "s.pdf", uploadedBy: pm.fullName });
    expect(await listDocuments(outsider, project.id)).toEqual([]);
  });
});

describe("addAttachment", () => {
  const input = (entityId: string, o: object = {}) => ({
    entityType: "WpDocument", entityId, kind: "SIGNED" as const, fileName: "signed.pdf", mime: "application/pdf", data: Buffer.from("p"), ...o,
  });

  test("signed evidence attaches to a WP document", async () => {
    const doc = await prisma.wpDocument.findFirstOrThrow({ where: { projectId: project.id, wpCode: "WP01" } });
    const r = await addAttachment(pm, project.id, input(doc.id));
    expect(r.ok).toBe(true);
    expect(await prisma.documentVersion.count()).toBe(0);
  });

  test("rejects other entity types, other projects' documents, empty/oversize files and non-writers", async () => {
    const doc = await prisma.wpDocument.findFirstOrThrow({ where: { projectId: project.id, wpCode: "WP02" } });
    expect((await addAttachment(pm, project.id, input(doc.id, { entityType: "Task" }))).ok).toBe(false);
    expect((await addAttachment(pm, project.id, input("nope"))).ok).toBe(false);
    const other = await createProject(admin, { code: "DOC-002", name: "Other", pmUserId: pm.id });
    if (!other.ok) throw new Error(other.error);
    const foreign = await prisma.wpDocument.findFirstOrThrow({ where: { projectId: other.data.id } });
    expect((await addAttachment(pm, project.id, input(foreign.id))).ok).toBe(false);
    expect(await addAttachment(pm, project.id, input(doc.id, { data: Buffer.alloc(0) }))).toEqual({ ok: false, error: "ไฟล์ว่างเปล่า" });
    expect(await addAttachment(pm, project.id, input(doc.id, { data: Buffer.alloc(MAX_FILE_BYTES + 1) }))).toEqual({ ok: false, error: "ไฟล์ใหญ่เกิน 50 MB" });
    expect((await addAttachment(viewer, project.id, input(doc.id))).ok).toBe(false);
    expect(await countStoredFiles(project.id)).toBe(0);
    expect(await prisma.attachment.count()).toBe(0);
  });

  test("attaches to a meeting of the project, Draft or Approved; not to another project's meeting", async () => {
    const day = new Date("2026-12-01T00:00:00.000Z");
    const m = await prisma.meeting.create({ data: { projectId: project.id, code: "MR-2569-01", topic: "t", meetingDate: day } });
    const meetingInput = (entityId: string) => input(entityId, { entityType: "meeting" });
    expect((await addAttachment(pm, project.id, meetingInput(m.id))).ok).toBe(true);
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "APPROVED" } });
    expect((await addAttachment(analyst, project.id, meetingInput(m.id))).ok).toBe(true);
    expect(await addAttachment(viewer, project.id, meetingInput(m.id))).toEqual({ ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" });
    expect(await addAttachment(pm, project.id, meetingInput("nope"))).toEqual({ ok: false, error: "ไม่พบการประชุม" });
    const other = await createProject(admin, { code: "DOC-003", name: "Other", pmUserId: pm.id });
    if (!other.ok) throw new Error(other.error);
    const foreign = await prisma.meeting.create({ data: { projectId: other.data.id, code: "MR-2569-01", topic: "t", meetingDate: day } });
    expect(await addAttachment(pm, project.id, meetingInput(foreign.id))).toEqual({ ok: false, error: "ไม่พบการประชุม" });
    const rows = await prisma.attachment.findMany({ where: { entityType: "meeting" } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.entityId === m.id && r.kind === "SIGNED")).toBe(true);
    expect(await countStoredFiles(project.id)).toBe(2);
  });
});

describe("GET /api/files/[id]", () => {
  async function download(user: User | null, id: string) {
    const headers: Record<string, string> = {};
    if (user) headers.cookie = `${SESSION_COOKIE}=${(await createSession(user.id)).token}`;
    return GET(new Request(`http://localhost/api/files/${id}`, { headers }), { params: Promise.resolve({ id }) });
  }

  test("member gets bytes with Thai filename, outsider and anonymous get 404", async () => {
    const r = await uploadVersion(pm, project.id, "WP10", { version: "1.0", fileName: "แผน.docx", mime: DOCX, data: Buffer.from("hello") });
    if (!r.ok) throw new Error(r.error);
    const id = r.data.attachmentId;

    const memberRes = await download(viewer, id);
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("content-disposition")).toContain("filename*=UTF-8''%E0%B9%81%E0%B8%9C%E0%B8%99.docx");
    expect(memberRes.headers.get("content-type")).toBe(DOCX);
    expect(memberRes.headers.get("content-length")).toBe("5");
    expect(memberRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(memberRes.headers.get("cache-control")).toBe("private, no-store");
    expect(await memberRes.text()).toBe("hello");

    for (const res of [await download(outsider, id), await download(null, id), await download(pm, "nope")]) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
    expect((await download(admin, id)).status).toBe(200);
  });
});

describe("compareVersions", () => {
  test("compares dot-separated parts numerically", () => {
    expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0", "1.10")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.9", "1.10")).toBeLessThan(0);
  });
});
