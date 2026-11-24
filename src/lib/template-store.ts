import fs from "node:fs/promises";
import path from "node:path";

export type WpFiles = { wpCode: string; template: string | null; extraTemplates: string[]; samples: string[] };

const WP_DIR_RE = /WP(\d{2})/;
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Folder that holds the templates and samples; never cached so a replaced file shows up on the next request. */
export function templatesRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.TEMPLATES_DIR?.trim() || "./templates");
}

async function realRoot(): Promise<string | null> {
  try {
    const real = await fs.realpath(/*turbopackIgnore: true*/ templatesRoot());
    return (await fs.stat(/*turbopackIgnore: true*/ real)).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

async function walk(dir: string, found: Map<string, string[]>, wpCode: string | null): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  } catch {
    return;
  }
  const here = WP_DIR_RE.exec(path.basename(dir));
  const code = here ? `WP${here[1]}` : wpCode;
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("~$")) continue;
    // Dirent reports symlinks as such (neither file nor directory), so links are never followed or listed.
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), found, code);
    else if (entry.isFile() && code && here) found.set(code, [...(found.get(code) ?? []), entry.name]);
  }
}

/** Every WP that has a folder under TEMPLATES_DIR, with its template and sample file names. */
export async function scanTemplates(): Promise<Map<string, WpFiles>> {
  const root = await realRoot();
  const result = new Map<string, WpFiles>();
  if (!root) return result;
  const found = new Map<string, string[]>();
  await walk(root, found, null);
  for (const [wpCode, names] of [...found].sort(([a], [b]) => byName(a, b))) {
    const prefix = `${wpCode}_`;
    const sorted = [...new Set(names)].sort(byName);
    const templates = sorted.filter((n) => n.startsWith(prefix));
    result.set(wpCode, {
      wpCode,
      template: templates[0] ?? null,
      extraTemplates: templates.slice(1),
      samples: sorted.filter((n) => !n.startsWith(prefix)),
    });
  }
  return result;
}

/**
 * Absolute path of a listed file, or null. The name must be one the scan returned for this WP (so no separators or
 * `..`), and the file's real path must still sit inside the real TEMPLATES_DIR.
 */
export async function resolveTemplateFile(wpCode: string, name: string): Promise<string | null> {
  const root = await realRoot();
  if (!root) return null;
  const files = (await scanTemplates()).get(wpCode);
  if (!files) return null;
  const listed = [files.template, ...files.extraTemplates, ...files.samples];
  if (!listed.includes(name)) return null;
  const found = await findFile(root, wpCode, name);
  if (!found) return null;
  try {
    const real = await fs.realpath(/*turbopackIgnore: true*/ found);
    if (real !== found || !real.startsWith(root + path.sep)) return null;
    return (await fs.stat(/*turbopackIgnore: true*/ real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

async function findFile(dir: string, wpCode: string, name: string): Promise<string | null> {
  let entries;
  try {
    entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const here = WP_DIR_RE.exec(path.basename(dir));
  if (here && `WP${here[1]}` === wpCode) {
    const hit = entries.find((e) => e.name === name && e.isFile());
    if (hit) return path.join(dir, name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = await findFile(path.join(dir, entry.name), wpCode, name);
    if (found) return found;
  }
  return null;
}
