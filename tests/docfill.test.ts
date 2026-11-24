import PizZip from "pizzip";
import { TemplateError, fillTemplate, listTags } from "@/lib/docfill";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CT = {
  document: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  header: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
};

/** Minimal docx: a body plus an optional header part. */
function docx(body: string, header?: string): Buffer {
  const z = new PizZip();
  z.file(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/word/document.xml" ContentType="${CT.document}"/>` +
      (header ? `<Override PartName="/word/header1.xml" ContentType="${CT.header}"/>` : "") +
      "</Types>",
  );
  z.file(
    "_rels/.rels",
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>",
  );
  z.file(
    "word/_rels/document.xml.rels",
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      (header
        ? '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
        : "") +
      "</Relationships>",
  );
  z.file("word/document.xml", `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`);
  if (header) z.file("word/header1.xml", `${XML}<w:hdr ${W}>${header}</w:hdr>`);
  return z.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

const p = (...runs: string[]) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;
const tc = (inner: string) => `<w:tc><w:tcPr/>${inner}</w:tc>`;
const table = (...rows: string[]) => `<w:tbl>${rows.map((r) => `<w:tr>${r}</w:tr>`).join("")}</w:tbl>`;

function xmlOf(buf: Buffer, part = "word/document.xml"): string {
  return new PizZip(buf).file(part)!.asText();
}
function textOf(buf: Buffer, part = "word/document.xml"): string {
  const raw = [...xmlOf(buf, part).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
  const ENT: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
  return raw.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ENT[e]);
}
function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TemplateError);
    return (e as TemplateError).problems;
  }
  throw new Error("expected TemplateError");
}

const LIST = p("{-w:p items}{text}{/items}");
const ROWS = table(tc(p("ลำดับ")) + tc(p("ชื่อ")), tc(p("{#rows}{no}")) + tc(p("{name}{/rows}")));

describe("fillTemplate", () => {
  test("fills scalars in body and header", () => {
    const out = fillTemplate(docx(p("โครงการ {projectName}"), p("{mrNo}")), { projectName: "ระบบ A", mrNo: "MR-2569-01" });
    expect(textOf(out)).toBe("โครงการ ระบบ A");
    expect(textOf(out, "word/header1.xml")).toBe("MR-2569-01");
  });

  test("table row loop repeats the row; paragraph loop repeats the bullet paragraph", () => {
    const out = fillTemplate(docx(ROWS + LIST), {
      rows: [
        { no: 1, name: "ก" },
        { no: 2, name: "ข" },
      ],
      items: [{ text: "หนึ่ง" }, { text: "สอง" }],
    });
    const xml = xmlOf(out);
    expect(xml.match(/<w:tr>/g)).toHaveLength(3);
    expect(textOf(out)).toBe("ลำดับชื่อ1ก2ขหนึ่งสอง");
    expect(xml.match(/<w:p>/g)!.length).toBe(2 + 4 + 2);
  });

  test("null, undefined and missing values become empty text", () => {
    const out = fillTemplate(docx(p("[{a}][{b}][{c}]")), { a: null, b: undefined });
    expect(textOf(out)).toBe("[][][]");
  });

  test("user text with braces, markup characters and line breaks appears literally", () => {
    const value = "a {projectName} } { <b>&amp; \"q\" 'x'\nบรรทัดสอง";
    const out = fillTemplate(docx(p("{v}") + ROWS), { v: value, rows: [{ no: 1, name: "{/rows}{#x}" }] });
    const xml = xmlOf(out);
    expect(xml).toContain("a {projectName} } { &lt;b&gt;&amp;amp; ");
    expect(xml).toMatch(/<w:br\/>/);
    expect(textOf(out)).toContain("บรรทัดสอง");
    expect(textOf(out)).toContain("{/rows}{#x}");
    // the other row cell and the rest of the document are untouched by the braces in the data
    expect(textOf(out)).toBe(`${value.replace("\n", "")}ลำดับชื่อ1{/rows}{#x}`);
  });

  test("empty loops: every table cell keeps a paragraph", () => {
    const out = fillTemplate(docx(table(tc(LIST) + tc(p("x"))) + ROWS), { items: [], rows: [] });
    const xml = xmlOf(out);
    for (const cell of xml.match(/<w:tc>.*?<\/w:tc>/g)!) expect(cell).toMatch(/<w:p[ >/]/);
    expect(textOf(out)).toBe("xลำดับชื่อ");
  });

  test("a cell left with only a nested table gets a closing paragraph", () => {
    // A cell whose last child is a table is invalid in Word; the filler repairs it.
    const inner = table(tc(p("{#rows}{no}")) + tc(p("{/rows}")));
    const out = fillTemplate(docx(table(tc(table(tc(p("h"))) + inner))), { rows: [{ no: 1 }] });
    expect(xmlOf(out)).not.toMatch(/<\/w:tbl><\/w:tc>/);
  });

  test("unclosed tag names the tag", () => {
    const problems = problemsOf(() => fillTemplate(docx(p("{purpose")), {}));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("purpose");
  });

  test("unopened loop, unclosed loop and mismatched loop name the tag", () => {
    expect(problemsOf(() => fillTemplate(docx(p("x{/attendees}")), {}))[0]).toContain("attendees");
    expect(problemsOf(() => fillTemplate(docx(p("{#issues}x")), {}))[0]).toContain("issues");
    const mismatch = problemsOf(() => fillTemplate(docx(p("{#a}{/b}")), {}));
    expect(mismatch[0]).toContain("a");
    expect(mismatch[0]).toContain("b");
  });

  test("several problems are all reported, in Thai", () => {
    const problems = problemsOf(() => fillTemplate(docx(p("{one}}") + p("x{/two}")), {}));
    expect(problems.length).toBeGreaterThanOrEqual(2);
    expect(problems.join("\n")).toContain("two");
    expect(problems.join("\n")).toMatch(/[ก-๙]/);
  });

  test("a file that is not a docx is a TemplateError", () => {
    expect(problemsOf(() => fillTemplate(Buffer.from("not a zip"), {}))[0]).toMatch(/[ก-๙]/);
  });
});

describe("listTags", () => {
  test("returns scalar, loop and inner tags from body and header, each once", () => {
    const buf = docx(p("{projectName}") + ROWS + LIST + p("{projectName}"), p("{mrNo}"));
    expect(listTags(buf).sort()).toEqual(["items", "mrNo", "name", "no", "projectName", "rows", "text"]);
  });

  test("finds a tag Word split across runs", () => {
    expect(listTags(docx(p("{pro", "ject", "Name}")))).toEqual(["projectName"]);
  });

  test("a broken template throws TemplateError naming the tag", () => {
    expect(problemsOf(() => listTags(docx(p("{topic"))))[0]).toContain("topic");
  });
});
