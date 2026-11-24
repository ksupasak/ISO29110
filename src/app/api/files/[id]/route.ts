import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth/session";
import { openFile } from "@/lib/storage";
import { encodeRFC5987, readCookie } from "@/lib/http";

export const dynamic = "force-dynamic";

const MIME_RE = /^[\w.+-]+\/[\w.+-]+(; ?[\w.+=\- "]+)?$/;
const notFound = () => new Response(null, { status: 404 });

/** Every failure (unknown id, no session, not a project viewer, missing file) is the same empty 404. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const user = await getSessionUser(readCookie(request, SESSION_COOKIE));
  if (!user) return notFound();
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return notFound();
  if (!can(await getActor(user, attachment.projectId), "project.view")) return notFound();
  let data: Buffer;
  try {
    data = await openFile(attachment.storedPath);
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME_RE.test(attachment.mime) ? attachment.mime : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeRFC5987(attachment.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
