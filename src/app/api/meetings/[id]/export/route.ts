import { prisma } from "@/lib/db";
import { can, getActor } from "@/lib/authz";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth/session";
import { encodeRFC5987, readCookie } from "@/lib/http";
import { exportMeeting } from "@/features/meetings/service";

export const dynamic = "force-dynamic";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const notFound = () => new Response(null, { status: 404 });

/**
 * WP07 docx of a meeting. No session, unknown meeting or not a project viewer: the same empty 404.
 * A template problem (or a lost approved copy): 422 with the Thai explanation as plain text.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const user = await getSessionUser(readCookie(request, SESSION_COOKIE));
  if (!user) return notFound();
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { projectId: true } });
  if (!meeting) return notFound();
  if (!can(await getActor(user, meeting.projectId), "project.view")) return notFound();
  const r = await exportMeeting(user, id);
  if (!r.ok) {
    return new Response(r.error, {
      status: 422,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  }
  return new Response(new Uint8Array(r.data.data), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Length": String(r.data.data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeRFC5987(r.data.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
