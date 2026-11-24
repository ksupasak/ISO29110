import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { createProject } from "@/features/projects/service";
import { approveMeeting, createMeeting } from "@/features/meetings/service";
import { GET } from "@/app/api/meetings/[id]/export/route";

const WP07_DIR = path.join("02_Project Plan Execution, Assessment and Control (PM.02-PM.03)", "05_WP07_Meeting Record");
const WP07_FILE = "WP07_meeting_record.docx";

let root: string;
let admin: User, pm: User, outsider: User;
let meetingId: string;
let code: string;
const saved = { dir: process.env.TEMPLATES_DIR, def: process.env.TEMPLATES_DEFAULT_DIR };

beforeEach(async () => {
  await resetDb();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mr-route-")));
  process.env.TEMPLATES_DIR = root;
  process.env.TEMPLATES_DEFAULT_DIR = path.resolve("templates-default");
  admin = await prisma.user.create({ data: { username: "ra", passwordHash: "x", fullName: "Admin", systemRole: "ADMIN" } });
  pm = await prisma.user.create({ data: { username: "rp", passwordHash: "x", fullName: "PM" } });
  outsider = await prisma.user.create({ data: { username: "ro", passwordHash: "x", fullName: "Out" } });
  const p = await createProject(admin, { code: "RT-1", name: "Route", pmUserId: pm.id });
  if (!p.ok) throw new Error(p.error);
  const m = await createMeeting(pm, p.data.id, { topic: "หัวข้อส่งออก", meetingDate: new Date("2026-12-01T00:00:00.000Z") });
  if (!m.ok) throw new Error(m.error);
  meetingId = m.data.id;
  code = m.data.code;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  for (const [key, value] of [["TEMPLATES_DIR", saved.dir], ["TEMPLATES_DEFAULT_DIR", saved.def]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function get(id: string, user: User | null) {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = `${SESSION_COOKIE}=${(await createSession(user.id)).token}`;
  return GET(new Request(`http://localhost/api/meetings/${id}/export`, { headers }), { params: Promise.resolve({ id }) });
}
const docText = (buf: Buffer) =>
  [...new PizZip(buf).file("word/document.xml")!.asText().matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("a viewer downloads the docx with the RFC 5987 file name, no-store", async () => {
  const res = await get(meetingId, pm);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(res.headers.get("content-disposition")).toBe(`attachment; filename*=UTF-8''RT-1_${code}.docx`);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const buf = Buffer.from(await res.arrayBuffer());
  expect(res.headers.get("content-length")).toBe(String(buf.length));
  expect(docText(buf)).toContain("หัวข้อส่งออก");
});

test("approved: the frozen copy", async () => {
  const a = await approveMeeting(pm, meetingId);
  if (!a.ok) throw new Error(a.error);
  const res = await get(meetingId, pm);
  expect(res.status).toBe(200);
  expect(docText(Buffer.from(await res.arrayBuffer()))).toContain("☑  Approved");
});

test("no session, unknown meeting, non-member: empty 404", async () => {
  for (const res of [await get(meetingId, null), await get("nope", pm), await get(meetingId, outsider)]) {
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  }
});

test("a broken template: 422 Thai plain text naming WP07 and the tag", async () => {
  const zip = new PizZip(fs.readFileSync(path.resolve("templates-default", WP07_DIR, WP07_FILE)));
  zip.file("word/document.xml", zip.file("word/document.xml")!.asText().replace("{topic}", "{topik}"));
  fs.mkdirSync(path.join(root, WP07_DIR), { recursive: true });
  fs.writeFileSync(path.join(root, WP07_DIR, WP07_FILE), zip.generate({ type: "nodebuffer" }));
  const res = await get(meetingId, pm);
  expect(res.status).toBe(422);
  expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  const body = await res.text();
  expect(body).toContain("WP07");
  expect(body).toContain("{topic}");
});
