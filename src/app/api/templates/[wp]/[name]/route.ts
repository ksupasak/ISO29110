import fs from "node:fs/promises";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth/session";
import { resolveTemplateFile } from "@/lib/template-store";

export const dynamic = "force-dynamic";

const notFound = () => new Response(null, { status: 404 });

const MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
};

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function encodeRFC5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
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
    data = await fs.readFile(file);
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
