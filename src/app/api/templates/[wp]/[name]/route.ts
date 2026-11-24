import fs from "node:fs/promises";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth/session";
import { encodeRFC5987, readCookie } from "@/lib/http";
import { resolveTemplateFile } from "@/lib/template-store";

export const dynamic = "force-dynamic";

const notFound = () => new Response(null, { status: 404 });

const MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
};

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Any logged-in user may download; every other outcome is the same empty 404. */
export async function GET(request: Request, ctx: { params: Promise<{ wp: string; name: string }> }): Promise<Response> {
  const { wp, name } = await ctx.params;
  const user = await getSessionUser(readCookie(request, SESSION_COOKIE));
  if (!user) return notFound();
  // The name must be one the scan lists, so trying the raw and the decoded form is safe.
  const file = (await resolveTemplateFile(wp, name)) ?? (await resolveTemplateFile(wp, safeDecode(name)));
  if (!file) return notFound();
  let data: Buffer;
  try {
    data = await fs.readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return notFound();
  }
  const base = file.slice(file.lastIndexOf("/") + 1);
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")).toLowerCase() : "";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeRFC5987(base)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
