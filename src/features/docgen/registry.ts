import fs from "node:fs/promises";
import { TemplateError, fillTemplate, tagTree, type TagTree } from "@/lib/docfill";
import { resolveTemplateFile, scanTemplates } from "@/lib/template-store";
import { WP07 } from "@/features/meetings/wp07";
import type { GeneratedWp, TagNode } from "./types";

export type { GeneratedWp, TagNode, TagSpec } from "./types";

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

/**
 * Compares the declared structure with the tags found in the file. Every problem names the tag and, for tags of a
 * loop, the loop: missing tags or loops, inner tags placed outside their loop, unknown tags (top level or in a loop).
 */
export function compareTags(wpCode: string, structure: TagNode[], tree: TagTree): string[] {
  const problems: string[] = [];
  const has = (t: TagTree, name: string) => Object.prototype.hasOwnProperty.call(t, name);
  const isLoop = (t: TagTree) => Object.keys(t).length > 0;
  const loopsOf = new Map<string, string[]>();
  for (const node of structure) for (const t of node.inner ?? []) loopsOf.set(t.name, [...(loopsOf.get(t.name) ?? []), node.name]);

  for (const node of structure) {
    if (!node.inner) {
      if (!has(tree, node.name)) problems.push(`ไม่พบเครื่องหมาย {${node.name}} (${node.meaning})`);
      else if (isLoop(tree[node.name])) problems.push(`เครื่องหมาย {${node.name}} ต้องเป็นค่าเดียว ไม่ใช่รายการซ้ำ`);
      continue;
    }
    if (!has(tree, node.name)) {
      problems.push(`ไม่พบรายการซ้ำ ${node.name} (${node.meaning})`);
      continue;
    }
    const found = tree[node.name];
    for (const t of node.inner) {
      if (!has(found, t.name)) problems.push(`ไม่พบเครื่องหมาย {${t.name}} ในรายการ ${node.name} (${t.meaning})`);
    }
    const inner = new Set(node.inner.map((t) => t.name));
    for (const [name, sub] of Object.entries(found)) {
      if (!inner.has(name)) problems.push(`เครื่องหมาย {${name}} ในรายการ ${node.name} ไม่อยู่ในรายการของ ${wpCode}`);
      else if (isLoop(sub)) problems.push(`เครื่องหมาย {${name}} ในรายการ ${node.name} ต้องเป็นค่าเดียว ไม่ใช่รายการซ้ำ`);
    }
  }

  const topLevel = new Set(structure.map((n) => n.name));
  for (const name of Object.keys(tree)) {
    if (topLevel.has(name)) continue;
    const loops = loopsOf.get(name);
    problems.push(
      loops
        ? `เครื่องหมาย {${name}} อยู่นอกรายการ ${loops.join(" / ")} ต้องวางไว้ภายในรายการนั้น`
        : `เครื่องหมาย {${name}} ไม่อยู่ในรายการของ ${wpCode}`,
    );
  }
  return problems;
}

/** File found, tag structure matches, and the sample data fills. Never throws for a template problem. */
export async function checkTemplate(wpCode: string): Promise<TemplateCheck> {
  const wp = GENERATED_WPS[wpCode];
  if (!wp) return { ok: false, problems: [`${wpCode} ไม่ใช่ WP ที่ระบบสร้างเอกสาร`] };
  const problems: string[] = [];
  try {
    const file = await loadTemplate(wpCode);
    problems.push(...compareTags(wpCode, wp.structure, tagTree(file)));
    fillTemplate(file, wp.sample);
  } catch (e) {
    if (!(e instanceof TemplateError)) throw e;
    problems.push(...e.problems);
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
