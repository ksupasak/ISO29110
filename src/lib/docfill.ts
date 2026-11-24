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

// Tag names are ASCII identifiers (plus loop prefixes); the library reports the raw text up to the next brace,
// which can run into the following words, so only the identifier part next to the brace is shown.
const NAME_CHARS = /[A-Za-z0-9_#/^.:-]/;
function leadingName(raw: string): string {
  let i = 0;
  while (i < raw.length && NAME_CHARS.test(raw[i])) i++;
  return raw.slice(0, i);
}
function trailingName(raw: string): string {
  let i = raw.length;
  while (i > 0 && NAME_CHARS.test(raw[i - 1])) i--;
  return raw.slice(i);
}

/** One Thai line for one docxtemplater error, naming the tag it is about. */
function describe(err: XtError): string {
  const p = err.properties ?? {};
  const tag = p.xtag ?? "";
  const where = partName(p.file);
  switch (p.id) {
    case "unclosed_tag":
      return `เครื่องหมาย {${leadingName(tag)} ไม่มีวงเล็บปิด }${where}`;
    case "unopened_tag":
      return `เครื่องหมาย ${trailingName(tag)}} ไม่มีวงเล็บเปิด {${where}`;
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

/** Tag name -> tags used inside it (empty for a plain tag). A loop's inner tags sit under the loop name. */
export type TagTree = { [name: string]: TagTree };
type TagsByPart = { document?: { tags: TagTree }; headers: { tags: TagTree }[]; footers: { tags: TagTree }[] };

function merge(into: TagTree, from: TagTree): void {
  for (const [name, inner] of Object.entries(from)) {
    if (!name.trim()) continue;
    into[name] ??= {};
    merge(into[name], inner);
  }
}

/** The nested tags of body, headers and footers merged into one tree; throws TemplateError. */
export function tagTree(docx: Buffer): TagTree {
  const parts = (open(docx) as unknown as { getTags(): TagsByPart }).getTags();
  const tree: TagTree = {};
  for (const part of [parts.document, ...parts.headers, ...parts.footers]) if (part) merge(tree, part.tags);
  return tree;
}

/** Unique tag names (scalars, loop names and tags inside loops) of body, headers and footers, sorted. */
export function listTags(docx: Buffer): string[] {
  const names = new Set<string>();
  const walk = (tree: TagTree) => {
    for (const [name, inner] of Object.entries(tree)) {
      names.add(name);
      walk(inner);
    }
  };
  walk(tagTree(docx));
  return [...names].sort();
}

// Characters not allowed in XML 1.0 (controls except tab/LF/CR, lone surrogates, U+FFFE, U+FFFF).
const INVALID_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/** Copy of the data with every string stripped of characters XML 1.0 cannot hold. */
function cleanData(value: unknown): unknown {
  if (typeof value === "string") return value.replace(INVALID_XML, "");
  if (Array.isArray(value)) return value.map(cleanData);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanData(v)]));
  }
  return value;
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
    doc.render(cleanData(data));
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
