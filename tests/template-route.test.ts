import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { GET } from "@/app/api/templates/[wp]/[name]/route";

const WP07_DIR = path.join("02_Project Plan Execution, Assessment and Control (PM.02-PM.03)", "05_WP07_Meeting Record");
const WP07_FILE = "WP07_meeting_record.docx";

let root: string;
let defRoot: string;
let user: User;
const saved = { dir: process.env.TEMPLATES_DIR, def: process.env.TEMPLATES_DEFAULT_DIR };

function put(base: string, rel: string, data: Buffer | string) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}
const shipped = () => fs.readFileSync(path.resolve("templates-default", WP07_DIR, WP07_FILE));

beforeEach(async () => {
  await resetDb();
  user = await prisma.user.create({ data: { username: "tpl", passwordHash: "x", fullName: "Template User" } });
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tplr-")));
  defRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tplr-def-")));
  process.env.TEMPLATES_DIR = root;
  process.env.TEMPLATES_DEFAULT_DIR = defRoot;
  put(defRoot, path.join(WP07_DIR, WP07_FILE), shipped());
  put(defRoot, path.join(WP07_DIR, "INT-2569-001_MR-2569-01.docx"), "sample bytes");
  put(defRoot, path.join("01_WP10_Project Plan", "WP10_project_plan.docx"), "plan bytes");
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(defRoot, { recursive: true, force: true });
  for (const [key, value] of [["TEMPLATES_DIR", saved.dir], ["TEMPLATES_DEFAULT_DIR", saved.def]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function download(wp: string, name: string, withSession = true) {
  const headers: Record<string, string> = {};
  if (withSession) headers.cookie = `${SESSION_COOKIE}=${(await createSession(user.id)).token}`;
  const encoded = encodeURIComponent(name);
  return GET(new Request(`http://localhost/api/templates/${wp}/${encoded}`, { headers }), {
    params: Promise.resolve({ wp, name: encoded }),
  });
}

const docText = (buf: Buffer) =>
  [...new PizZip(buf).file("word/document.xml")!.asText().matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("the WP07 template is sent filled with blank data: no tags, 3 numbered rows, boxes unticked", async () => {
  const res = await download("WP07", WP07_FILE);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(res.headers.get("content-disposition")).toContain(WP07_FILE);
  const buf = Buffer.from(await res.arrayBuffer());
  expect(res.headers.get("content-length")).toBe(String(buf.length));
  const text = docText(buf);
  expect(text).not.toMatch(/[{}]/);
  expect(text).toContain("☐  Draft");
  expect(text).toContain("Purpose of meeting");
});

test("WP07 samples and other WPs' templates are sent byte for byte", async () => {
  const sample = await download("WP07", "INT-2569-001_MR-2569-01.docx");
  expect(sample.status).toBe(200);
  expect(await sample.text()).toBe("sample bytes");
  const plan = await download("WP10", "WP10_project_plan.docx");
  expect(plan.status).toBe(200);
  expect(await plan.text()).toBe("plan bytes");
});

test("a broken override template answers 422 with Thai text naming the WP and the tag", async () => {
  const zip = new PizZip(shipped());
  zip.file("word/document.xml", zip.file("word/document.xml")!.asText().replace("{/attendees}", "{/attendee}"));
  put(root, path.join(WP07_DIR, WP07_FILE), zip.generate({ type: "nodebuffer" }));
  const res = await download("WP07", WP07_FILE);
  expect(res.status).toBe(422);
  expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.text();
  expect(body).toContain("WP07");
  expect(body).toContain("attendee");
  expect(body).toMatch(/[ก-๙]/);
});

test("anonymous gets 404 also for the generated template", async () => {
  const res = await download("WP07", WP07_FILE, false);
  expect(res.status).toBe(404);
  expect(await res.text()).toBe("");
});
