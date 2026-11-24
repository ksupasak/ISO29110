import fs from "node:fs/promises";
import { TemplateError, fillTemplate, listTags } from "@/lib/docfill";
import { resolveTemplateFile, scanTemplates } from "@/lib/template-store";
import { WP07 } from "@/features/meetings/wp07";

/** A WP whose document the system fills from a tagged template. */
export type GeneratedWp = {
  wpCode: string;
  /** Every tag the template must hold (loop names and tags inside loops included), with its meaning in Thai. */
  tags: { name: string; meaning: string }[];
  /** Realistic data used by the template check. */
  sample: Record<string, unknown>;
  /** Empty values (lists with 3 empty rows) for the hand-fill download. */
  blank: Record<string, unknown>;
};

export const GENERATED_WPS: Record<string, GeneratedWp> = { WP07 };

export type TemplateCheck = { ok: true } | { ok: false; problems: string[] };

/** The template file of a WP as the template store resolves it (override beats default). */
export async function loadTemplate(wpCode: string): Promise<Buffer> {
  const name = (await scanTemplates()).get(wpCode)?.template;
  const file = name ? await resolveTemplateFile(wpCode, name) : null;
  const missing = new TemplateError([`ไม่พบไฟล์ template ของ ${wpCode}`]);
  if (!file) throw missing;
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ file);
  } catch {
    throw missing;
  }
}

/** Thai text for a failed fill of a WP: one line naming the WP, then one line per problem. */
export function templateErrorText(wpCode: string, err: TemplateError): string {
  return [`template ของ ${wpCode} ใช้ไม่ได้`, ...err.problems.map((p) => `- ${p}`)].join("\n");
}

/** File found, tags present, no unknown tags, and the sample data fills. Never throws for a template problem. */
export async function checkTemplate(wpCode: string): Promise<TemplateCheck> {
  const wp = GENERATED_WPS[wpCode];
  if (!wp) return { ok: false, problems: [`${wpCode} ไม่ใช่ WP ที่ระบบสร้างเอกสาร`] };
  const problems: string[] = [];
  try {
    const file = await loadTemplate(wpCode);
    const found = new Set(listTags(file));
    const declared = new Set(wp.tags.map((t) => t.name));
    for (const t of wp.tags) if (!found.has(t.name)) problems.push(`ไม่พบเครื่องหมาย {${t.name}} (${t.meaning})`);
    for (const name of found) if (!declared.has(name)) problems.push(`เครื่องหมาย {${name}} ไม่อยู่ในรายการของ ${wpCode}`);
    fillTemplate(file, wp.sample);
  } catch (e) {
    if (!(e instanceof TemplateError)) throw e;
    problems.push(...e.problems);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
