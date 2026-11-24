import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PizZip from "pizzip";
import { fillTemplate, listTags } from "@/lib/docfill";
import { GENERATED_WPS, checkTemplate, loadTemplate } from "@/features/docgen/registry";
import { WP07, meetingDocData, type MeetingDocSource } from "@/features/meetings/wp07";

const DEFAULTS = path.resolve("templates-default");
const WP07_DIR = path.join("02_Project Plan Execution, Assessment and Control (PM.02-PM.03)", "05_WP07_Meeting Record");
const WP07_FILE = "WP07_meeting_record.docx";

let overrideRoot: string;
const saved = { dir: process.env.TEMPLATES_DIR, def: process.env.TEMPLATES_DEFAULT_DIR };

beforeEach(() => {
  overrideRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "wp07-")));
  process.env.TEMPLATES_DIR = overrideRoot;
  process.env.TEMPLATES_DEFAULT_DIR = DEFAULTS;
});
afterEach(() => {
  fs.rmSync(overrideRoot, { recursive: true, force: true });
  for (const [key, value] of [["TEMPLATES_DIR", saved.dir], ["TEMPLATES_DEFAULT_DIR", saved.def]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const shipped = () => fs.readFileSync(path.join(DEFAULTS, WP07_DIR, WP07_FILE));

function parts(buf: Buffer): Record<string, string> {
  const zip = new PizZip(buf);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) out[name] = zip.file(name)!.asText();
  return out;
}
const textOf = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

/** Writes an override WP07 template whose document.xml is the shipped one passed through `edit`. */
function override(edit: (xml: string) => string) {
  const zip = new PizZip(shipped());
  zip.file("word/document.xml", edit(zip.file("word/document.xml")!.asText()));
  const dir = path.join(overrideRoot, WP07_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, WP07_FILE), zip.generate({ type: "nodebuffer" }));
}

const HEADINGS = [
  "Purpose of meeting",
  "Name of attendees",
  "Date, place held",
  "Reference to previous minutes",
  "What was accomplished",
  "Related issues",
  "Any open issues",
  "Agreements",
  "Next meeting, if any",
];
const TABLE_HEADERS = ["ลำดับ", "ชื่อ-สกุล", "ตำแหน่ง", "หน่วยงาน", "บทบาทในโครงการ", "ประเด็นค้าง", "ผู้รับผิดชอบ", "กำหนดชี้แจง", "สถานะ"];

describe("shipped WP07 template", () => {
  test("is registered and passes the check", async () => {
    expect(GENERATED_WPS.WP07).toBe(WP07);
    expect(await checkTemplate("WP07")).toEqual({ ok: true });
  });

  test("declares exactly the tags found in the file", () => {
    expect(listTags(shipped())).toEqual(WP07.tags.map((t) => t.name).sort());
  });

  test("the sample fills every tag: headings, table headers and sample values stay; no tag is left", () => {
    const out = parts(fillTemplate(shipped(), WP07.sample));
    const all = Object.values(out).map(textOf).join("\n");
    expect(all).not.toMatch(/[{}]/);
    for (const h of [...HEADINGS, ...TABLE_HEADERS]) expect(all).toContain(h);
    for (const v of ["MR-2569-03", "ระบบบริหารโครงการ", "สมชาย ใจดี", "ทบทวนแผนงานครั้งที่ 1", "ปิดแล้ว (T-012)", "09:30 – 11:30 น.", "☑", "☐"]) {
      expect(all).toContain(v);
    }
    expect(textOf(out["word/header1.xml"])).toContain("MR-2569-03");
    expect(textOf(out["word/header1.xml"])).toContain("1.0");
  });

  test("a meeting with empty lists still gives a valid document: every cell keeps a paragraph", () => {
    const data = meetingDocData(source({ attendees: [], items: [], previous: null, nextTopic: null, nextDate: null }));
    const buf = fillTemplate(shipped(), data);
    const reopened = parts(buf);
    const doc = reopened["word/document.xml"];
    const cells = doc.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!;
    expect(cells.length).toBeGreaterThan(20);
    // every </w:tc> is directly preceded by a paragraph end
    expect(doc).not.toMatch(/(?<!<\/w:p>|<w:p\/>)<\/w:tc>/);
    const text = textOf(doc);
    expect(text).not.toMatch(/[{}]/);
    for (const h of [...HEADINGS, ...TABLE_HEADERS]) expect(text).toContain(h);
    expect(text).not.toContain("undefined");
  });

  test("blank data gives 3 numbered empty rows in both tables and both boxes unticked", () => {
    const doc = parts(fillTemplate(shipped(), WP07.blank))["word/document.xml"];
    const rows = (doc.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []).map(textOf);
    expect(rows.filter((r) => /^[123]$/.test(r))).toEqual(["1", "2", "3", "1", "2", "3"]);
    expect(textOf(doc)).toContain("☐  Draft");
    expect(textOf(doc)).toContain("☐  Approved");
    expect(textOf(doc)).not.toMatch(/[{}]|undefined/);
  });

  test("user text with braces and markup is printed literally", () => {
    const data = meetingDocData(source({ topic: "ทดสอบ {purpose} <b> & {#x}", purpose: "บรรทัด 1\nบรรทัด 2" }));
    const doc = parts(fillTemplate(shipped(), data))["word/document.xml"];
    expect(doc).toContain("ทดสอบ {purpose} &lt;b&gt; &amp; {#x}");
    expect(doc).toMatch(/บรรทัด 1<\/w:t><\/w:r><w:r>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:br\/>/);
  });
});

describe("checkTemplate / loadTemplate with an override", () => {
  test("a removed tag is reported by name", async () => {
    override((xml) => xml.replace("{purpose}", ""));
    const r = await checkTemplate("WP07");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toContain("purpose");
  });

  test("an unknown tag is reported by name", async () => {
    override((xml) => xml.replace("{purpose}", "{purpose} {foo}"));
    const r = await checkTemplate("WP07");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.join("\n")).toContain("foo");
      expect(r.problems.join("\n")).not.toContain("purpose");
    }
  });

  test("an unclosed tag is reported by name, not thrown", async () => {
    override((xml) => xml.replace("{purpose}", "{purpose"));
    const r = await checkTemplate("WP07");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toContain("purpose");
  });

  test("the override file is used before the shipped one", async () => {
    override((xml) => xml.replace("{purpose}", "{purpose}OVERRIDE"));
    expect((await loadTemplate("WP07")).equals(shipped())).toBe(false);
  });

  test("no template anywhere: Thai error naming the WP", async () => {
    process.env.TEMPLATES_DEFAULT_DIR = overrideRoot;
    await expect(loadTemplate("WP07")).rejects.toMatchObject({ problems: ["ไม่พบไฟล์ template ของ WP07"] });
    expect(await checkTemplate("WP07")).toEqual({ ok: false, problems: ["ไม่พบไฟล์ template ของ WP07"] });
  });
});

// ---------- meetingDocData ----------

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function source(over: Partial<MeetingDocSource> = {}): MeetingDocSource {
  return {
    code: "MR-2569-03",
    status: "DRAFT",
    topic: "ติดตามความคืบหน้า",
    meetingDate: d("2026-12-15"),
    startTime: "09:30",
    endTime: "11:30",
    place: "ห้องประชุม 1",
    recorder: "สมหญิง",
    organizer: "สมชาย",
    purpose: "ทบทวนแผน",
    previous: null,
    previousNote: null,
    nextTopic: "ครั้งถัดไป",
    nextDate: d("2026-12-22"),
    nextStartTime: "13:00",
    nextEndTime: null,
    nextPlace: "Online",
    attendees: [],
    items: [],
    project: { name: "ระบบ A", code: "INT-2569-001" },
    ...over,
  };
}

const att = (order: number, fullName: string, present = true) => ({
  order,
  fullName,
  position: `ตำแหน่ง ${order}`,
  organization: null,
  projectRole: "ผู้จัดการโครงการ",
  present,
});

describe("meetingDocData", () => {
  test("header, info table and status boxes", () => {
    const data = meetingDocData(source());
    expect(data).toMatchObject({
      mrNo: "MR-2569-03",
      docDate: "15/12/2569",
      projectName: "ระบบ A",
      projectCode: "INT-2569-001",
      topic: "ติดตามความคืบหน้า",
      meetingDate: "15/12/2569",
      meetingTime: "09:30 – 11:30 น.",
      place: "ห้องประชุม 1",
      recorder: "สมหญิง",
      organizer: "สมชาย",
      purpose: "ทบทวนแผน",
      draftBox: "☑",
      approvedBox: "☐",
      nextTopic: "ครั้งถัดไป",
      nextDate: "22/12/2569",
      nextTime: "13:00 น.",
      nextPlace: "Online",
    });
    expect(meetingDocData(source({ status: "APPROVED" }))).toMatchObject({ draftBox: "☐", approvedBox: "☑" });
  });

  test("times: start only, none, end only", () => {
    expect(meetingDocData(source({ endTime: null })).meetingTime).toBe("09:30 น.");
    expect(meetingDocData(source({ startTime: null, endTime: null })).meetingTime).toBe("");
    expect(meetingDocData(source({ startTime: null })).meetingTime).toBe("– 11:30 น.");
    expect(meetingDocData(source({ nextStartTime: null, nextEndTime: null })).nextTime).toBe("");
  });

  test("present attendees in order numbered from 1; absentees joined by comma", () => {
    const data = meetingDocData(source({ attendees: [att(3, "ค"), att(1, "ก"), att(2, "ข", false), att(4, "ง", false)] }));
    expect(data.attendees).toEqual([
      { no: 1, name: "ก", position: "ตำแหน่ง 1", organization: "", role: "ผู้จัดการโครงการ" },
      { no: 2, name: "ค", position: "ตำแหน่ง 3", organization: "", role: "ผู้จัดการโครงการ" },
    ]);
    expect(data.absentees).toBe("ข, ง");
    expect(meetingDocData(source()).absentees).toBe("");
  });

  test("previous reference", () => {
    const previous = { code: "MR-2569-01", meetingDate: d("2026-12-15") };
    expect(meetingDocData(source({ previous })).previousRef).toBe("MR-2569-01 วันที่ 15/12/2569");
    expect(meetingDocData(source({ previous, previousNote: "แก้ไขข้อ 2" })).previousRef).toBe("MR-2569-01 วันที่ 15/12/2569 – แก้ไขข้อ 2");
    expect(meetingDocData(source({ previousNote: "จากอีเมล" })).previousRef).toBe("จากอีเมล");
    expect(meetingDocData(source()).previousRef).toBe("ไม่มี");
  });

  test("items by kind in order; open issues with owner, due and effective status", () => {
    const base = { ownerName: null, dueDate: null, status: "OPEN" as const, task: null };
    const data = meetingDocData(
      source({
        items: [
          { ...base, kind: "AGREEMENT", order: 1, text: "ตกลง" },
          { ...base, kind: "ACCOMPLISHED", order: 2, text: "เสร็จ 2" },
          { ...base, kind: "ACCOMPLISHED", order: 1, text: "เสร็จ 1" },
          { ...base, kind: "ISSUE", order: 1, text: "ประเด็น" },
          { ...base, kind: "OPEN_ISSUE", order: 2, text: "ค้างมีงาน", ownerName: "สมชาย", dueDate: d("2026-12-20"), task: { code: "T-012", status: "DOING" } },
          { ...base, kind: "OPEN_ISSUE", order: 1, text: "ปิดเอง", status: "CLOSED" },
          { ...base, kind: "OPEN_ISSUE", order: 3, text: "งานเสร็จ", status: "OPEN", task: { code: "T-013", status: "DONE" } },
        ],
      }),
    );
    expect(data.accomplished).toEqual([{ text: "เสร็จ 1" }, { text: "เสร็จ 2" }]);
    expect(data.issues).toEqual([{ text: "ประเด็น" }]);
    expect(data.agreements).toEqual([{ text: "ตกลง" }]);
    expect(data.openIssues).toEqual([
      { no: 1, text: "ปิดเอง", owner: "", due: "", status: "ปิดแล้ว" },
      { no: 2, text: "ค้างมีงาน", owner: "สมชาย", due: "20/12/2569", status: "ค้าง (T-012)" },
      { no: 3, text: "งานเสร็จ", owner: "", due: "", status: "ปิดแล้ว (T-013)" },
    ]);
  });

  test("null and missing values become empty strings, never 'undefined'", () => {
    const data = meetingDocData(
      source({ place: null, recorder: null, organizer: null, purpose: null, nextTopic: null, nextDate: null, nextPlace: null, nextStartTime: null }),
    );
    expect(JSON.stringify(data)).not.toContain("undefined");
    expect(data).toMatchObject({ place: "", recorder: "", organizer: "", purpose: "", nextTopic: "", nextDate: "", nextTime: "", nextPlace: "" });
  });

  test("blank data: empty scalars, both boxes unticked, 3 empty rows per list", () => {
    const b = WP07.blank as Record<string, unknown>;
    expect(b.draftBox).toBe("☐");
    expect(b.approvedBox).toBe("☐");
    for (const k of ["mrNo", "docDate", "projectName", "topic", "purpose", "absentees", "previousRef", "nextTopic"]) expect(b[k]).toBe("");
    expect(b.attendees).toEqual([1, 2, 3].map((no) => ({ no, name: "", position: "", organization: "", role: "" })));
    expect(b.openIssues).toEqual([1, 2, 3].map((no) => ({ no, text: "", owner: "", due: "", status: "" })));
    for (const k of ["accomplished", "issues", "agreements"]) expect(b[k]).toEqual([{ text: "" }, { text: "" }, { text: "" }]);
  });
});
