import { Prisma, type AttachmentKind, type DocumentVersion, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { fail, ok, type ActionResult } from "@/lib/result";
import { deleteFile, saveFile } from "@/lib/storage";
import { FILE_TOO_LARGE_MESSAGE, MAX_FILE_BYTES } from "@/lib/upload-limits";
import { PHASES, WP_CATALOG, getWp, isFinalStatus, type Phase, type WpDef } from "@/lib/wp-catalog";

const FORBIDDEN = "ไม่มีสิทธิ์ดำเนินการ";
const VERSION_RE = /^\d+\.\d+(\.\d+)?$/;
const WP_ENTITY = "WpDocument";

export type DocItem = {
  wp: WpDef;
  id: string;
  status: string;
  currentVersion: string | null;
  versions: { version: string; note: string | null; attachmentId: string; fileName: string; uploadedBy: string; createdAt: Date }[];
  attachments: { id: string; kind: AttachmentKind; fileName: string; uploadedBy: string; createdAt: Date }[];
};
export type PhaseView = { phase: Phase; items: DocItem[] };

type FileInput = { fileName: string; mime: string; data: Buffer };

function knownWp(wpCode: string): WpDef | null {
  try {
    return getWp(wpCode);
  } catch {
    return null;
  }
}

/** Numeric comparison per dot-separated part (missing parts count as 0): 1.10 > 1.9, 2.0 > 1.10. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Best-effort cleanup: a failure here must never replace the original error or result. */
async function discardFile(storedPath: string): Promise<void> {
  try {
    await deleteFile(storedPath);
  } catch {
    // ignore
  }
}

function checkFile(data: Buffer): string | null {
  if (data.length === 0) return "ไฟล์ว่างเปล่า";
  if (data.length > MAX_FILE_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return null;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function uploadVersion(
  user: User,
  projectId: string,
  wpCode: string,
  input: { version: string; note?: string } & FileInput,
): Promise<ActionResult<DocumentVersion>> {
  if (!can(await getActor(user, projectId), "document.upload")) return fail(FORBIDDEN);
  if (!knownWp(wpCode)) return fail("ไม่พบเอกสาร");
  const version = input.version.trim();
  if (!VERSION_RE.test(version)) return fail("รูปแบบเวอร์ชันไม่ถูกต้อง เช่น 1.0");
  const fileError = checkFile(input.data);
  if (fileError) return fail(fileError);
  const doc = await prisma.wpDocument.findUnique({ where: { projectId_wpCode: { projectId, wpCode } } });
  if (!doc) return fail("ไม่พบเอกสาร");
  const dupWhere = { wpDocumentId_version: { wpDocumentId: doc.id, version } };
  if (await prisma.documentVersion.findUnique({ where: dupWhere })) return fail("เวอร์ชันนี้มีอยู่แล้ว");

  const saved = await saveFile(projectId, input.fileName, input.data);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          projectId,
          entityType: WP_ENTITY,
          entityId: doc.id,
          kind: "OTHER",
          fileName: input.fileName,
          storedPath: saved.storedPath,
          size: saved.size,
          mime: input.mime,
          uploadedById: user.id,
        },
      });
      const v = await tx.documentVersion.create({
        data: {
          wpDocumentId: doc.id,
          version,
          note: input.note?.trim() || null,
          attachmentId: attachment.id,
          uploadedById: user.id,
        },
      });
      const cur = await tx.wpDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { currentVersion: true } });
      if (!cur.currentVersion || compareVersions(version, cur.currentVersion) > 0) {
        await tx.wpDocument.update({ where: { id: doc.id }, data: { currentVersion: version } });
      }
      return v;
    });
    return ok(created);
  } catch (e) {
    await discardFile(saved.storedPath);
    if (isUniqueViolation(e)) return fail("เวอร์ชันนี้มีอยู่แล้ว");
    throw e;
  }
}

export async function setDocumentStatus(
  user: User,
  projectId: string,
  wpCode: string,
  status: string,
): Promise<ActionResult<null>> {
  const actor = await getActor(user, projectId);
  const wp = knownWp(wpCode);
  if (!wp) return can(actor, "document.setStatus") ? fail("ไม่พบเอกสาร") : fail(FORBIDDEN);
  const doc = await prisma.wpDocument.findUnique({ where: { projectId_wpCode: { projectId, wpCode } } });
  const needsBaseline = isFinalStatus(status) || (doc !== null && isFinalStatus(doc.status));
  if (!can(actor, needsBaseline ? "document.baseline" : "document.setStatus")) return fail(FORBIDDEN);
  if (!doc) return fail("ไม่พบเอกสาร");
  if (!["Draft", ...wp.states].includes(status)) return fail("สถานะไม่ถูกต้อง");
  await prisma.wpDocument.update({ where: { id: doc.id }, data: { status } });
  return ok(null);
}

export async function addAttachment(
  user: User,
  projectId: string,
  input: { entityType: string; entityId: string; kind: AttachmentKind } & FileInput,
): Promise<ActionResult<{ id: string }>> {
  if (!can(await getActor(user, projectId), "attachment.add")) return fail(FORBIDDEN);
  if (input.entityType !== WP_ENTITY) return fail("ไม่รองรับการแนบไฟล์กับรายการนี้");
  if (!["EVIDENCE", "SIGNED", "OTHER"].includes(input.kind)) return fail("ประเภทไฟล์แนบไม่ถูกต้อง");
  const fileError = checkFile(input.data);
  if (fileError) return fail(fileError);
  const doc = await prisma.wpDocument.findFirst({ where: { id: input.entityId, projectId }, select: { id: true } });
  if (!doc) return fail("ไม่พบเอกสาร");

  const saved = await saveFile(projectId, input.fileName, input.data);
  try {
    const a = await prisma.attachment.create({
      data: {
        projectId,
        entityType: WP_ENTITY,
        entityId: doc.id,
        kind: input.kind,
        fileName: input.fileName,
        storedPath: saved.storedPath,
        size: saved.size,
        mime: input.mime,
        uploadedById: user.id,
      },
    });
    return ok({ id: a.id });
  } catch (e) {
    await discardFile(saved.storedPath);
    throw e;
  }
}

/** The 23 work products grouped by phase. Empty for callers who cannot view the project. */
export async function listDocuments(user: User, projectId: string): Promise<PhaseView[]> {
  if (!can(await getActor(user, projectId), "project.view")) return [];
  const [docs, attachments] = await Promise.all([
    prisma.wpDocument.findMany({
      where: { projectId },
      include: {
        versions: {
          include: { attachment: { select: { fileName: true } }, uploadedBy: { select: { fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.attachment.findMany({
      where: { projectId, entityType: WP_ENTITY, version: null },
      include: { uploadedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const byCode = new Map(docs.map((d) => [d.wpCode, d]));
  const toItem = (wp: WpDef): DocItem | null => {
    const d = byCode.get(wp.code);
    if (!d) return null;
    return {
      wp,
      id: d.id,
      status: d.status,
      currentVersion: d.currentVersion,
      versions: d.versions.map((v) => ({
        version: v.version,
        note: v.note,
        attachmentId: v.attachmentId,
        fileName: v.attachment.fileName,
        uploadedBy: v.uploadedBy.fullName,
        createdAt: v.createdAt,
      })),
      attachments: attachments
        .filter((a) => a.entityId === d.id)
        .map((a) => ({ id: a.id, kind: a.kind, fileName: a.fileName, uploadedBy: a.uploadedBy.fullName, createdAt: a.createdAt })),
    };
  };
  return PHASES.map((phase) => ({
    phase,
    items: WP_CATALOG.filter((w) => w.phaseNo === phase.no)
      .sort((a, b) => a.seq - b.seq)
      .map(toItem)
      .filter((i): i is DocItem => i !== null),
  }));
}
