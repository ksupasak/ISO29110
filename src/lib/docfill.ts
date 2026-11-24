import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/** A template that cannot be read or filled. `problems` are Thai, one line per problem. */
export class TemplateError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "TemplateError";
    this.problems = problems;
  }
}

type XtError = { properties?: { id?: string; xtag?: string; openingtag?: string; closingtag?: string; explanation?: string; file?: string } };

const PART_NAME: Record<string, string> = { "word/document.xml": "เนื้อหา" };
function partName(file: string | undefined): string {
  if (!file) return "";
  if (PART_NAME[file]) return ` (${PART_NAME[file]})`;
  if (/^word\/header\d*\.xml$/.test(file)) return " (หัวกระดาษ)";
  if (/^word\/footer\d*\.xml$/.test(file)) return " (ท้ายกระดาษ)";
  return ` (${file})`;
}

/** One Thai line for one docxtemplater error, naming the tag it is about. */
function describe(err: XtError): string {
  const p = err.properties ?? {};
  const tag = p.xtag ?? "";
  const where = partName(p.file);
  switch (p.id) {
    // The library reports the text up to the next brace, which may run into the following words.
    case "unclosed_tag":
      return `เครื่องหมายที่ขึ้นต้นด้วย "{${tag.slice(0, 30)}" ไม่มีวงเล็บปิด }${where}`;
    case "unopened_tag":
      return `เครื่องหมายที่ลงท้ายด้วย "${tag.slice(-30)}}" ไม่มีวงเล็บเปิด {${where}`;
    case "duplicate_open_tag":
      return `เครื่องหมาย ${tag} มีวงเล็บเปิด { ซ้อนกัน${where}`;
    case "duplicate_close_tag":
      return `เครื่องหมาย ${tag} มีวงเล็บปิด } ซ้อนกัน${where}`;
    case "unclosed_loop":
      return `รายการซ้ำ {#${tag}} ไม่มีเครื่องหมายปิด {/${tag}}${where}`;
    case "unopened_loop":
      return `เครื่องหมายปิด {/${tag}} ไม่มีรายการซ้ำ {#${tag}} เปิดก่อน${where}`;
    case "closing_tag_does_not_match_opening_tag":
      return `รายการซ้ำ {#${p.openingtag}} ถูกปิดด้วย {/${p.closingtag}} ซึ่งไม่ตรงกัน${where}`;
    case "unbalanced_loop_tags":
      return `รายการซ้ำเปิดและปิดสลับกัน${where}`;
    case "loop_position_invalid":
      return `รายการซ้ำ ${tag} วางผิดตำแหน่ง เช่น เปิดในตารางแต่ปิดนอกตาราง${where}`;
    case "malformed_xml":
    case "file_has_invalid_xml":
      return `ไฟล์ template เสีย อ่านโครงสร้างเอกสารไม่ได้${where}`;
    default:
      return `template มีข้อผิดพลาด: ${p.explanation ?? (err as Error).message ?? "ไม่ทราบสาเหตุ"}${where}`;
  }
}

function toTemplateError(e: unknown): TemplateError {
  if (e instanceof TemplateError) return e;
  const list = (e as { properties?: { errors?: XtError[] } }).properties?.errors;
  const problems = (Array.isArray(list) && list.length > 0 ? list : [e as XtError]).map(describe);
  return new TemplateError([...new Set(problems)]);
}

function open(docx: Buffer): Docxtemplater {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch {
    throw new TemplateError(["ไฟล์ template ไม่ใช่ไฟล์ docx ที่เปิดได้"]);
  }
  try {
    return new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      stripInvalidXMLChars: true,
      errorLogging: false,
      nullGetter: () => "",
    });
  } catch (e) {
    throw toTemplateError(e);
  }
}

type TagTree = { [name: string]: TagTree };
type TagsByPart = { document?: { tags: TagTree }; headers: { tags: TagTree }[]; footers: { tags: TagTree }[] };

/** Unique tag names (scalars, loop names and tags inside loops) of body, headers and footers, sorted. */
export function listTags(docx: Buffer): string[] {
  const doc = open(docx);
  const parts = (doc as unknown as { getTags(): TagsByPart }).getTags();
  const names = new Set<string>();
  const walk = (tree: TagTree) => {
    for (const [name, inner] of Object.entries(tree)) {
      if (name.trim()) names.add(name);
      walk(inner);
    }
  };
  for (const part of [parts.document, ...parts.headers, ...parts.footers]) if (part) walk(part.tags);
  return [...names].sort();
}

const PARA_END = /(?:<\/w:p>|<w:p(?:\s[^>]*)?\/>)$/;

/** Word needs every table cell to end with a paragraph; an emptied loop or nested table can leave one without. */
function repairCells(xml: string): string {
  return xml.replace(/<\/w:tc>/g, (close, offset: number) => (PARA_END.test(xml.slice(Math.max(0, offset - 64), offset)) ? close : `<w:p/>${close}`));
}

/** Fills a tagged docx with `data`; throws TemplateError (Thai problems) for a broken template. */
export function fillTemplate(docx: Buffer, data: Record<string, unknown>): Buffer {
  const doc = open(docx);
  try {
    doc.render(data);
  } catch (e) {
    throw toTemplateError(e);
  }
  const zip = doc.getZip() as PizZip;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = zip.file(name)!.asText();
    const fixed = repairCells(xml);
    if (fixed !== xml) zip.file(name, fixed);
  }
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
