import fs from "node:fs/promises";
import path from "node:path";

export type TemplateSource = "override" | "default";
export type WpFiles = {
  wpCode: string;
  template: string | null;
  /** Which folder the template comes from; null when the WP has none. */
  templateSource: TemplateSource | null;
  extraTemplates: string[];
  samples: string[];
};

// `WP` + exactly two digits, not glued to a letter/digit before or a digit after.
const WP_DIR_RE = /(?<![A-Za-z0-9])WP(\d{2})(?!\d)/;
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Admin-editable folder (override); never cached so a replaced file shows up on the next request. */
export function templatesRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.TEMPLATES_DIR?.trim() || "./templates");
}

/** Shipped defaults; replaced by upgrades, never edited on the server. */
export function defaultTemplatesRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.TEMPLATES_DEFAULT_DIR?.trim() || "./templates-default");
}

async function realRoot(dir: string): Promise<string | null> {
  try {
    const real = await fs.realpath(/*turbopackIgnore: true*/ dir);
    return (await fs.stat(/*turbopackIgnore: true*/ real)).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

type Found = { name: string; abs: string; root: string; source: TemplateSource };

async function walk(dir: string, root: string, source: TemplateSource, out: Map<string, Found[]>, wpCode: string | null): Promise<void> {
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
    const abs = path.join(dir, entry.name);
    // Dirent reports symlinks as such (neither file nor directory), so links are never followed or listed.
    if (entry.isDirectory()) await walk(abs, root, source, out, code);
    else if (entry.isFile() && here && code) out.set(code, [...(out.get(code) ?? []), { name: entry.name, abs, root, source }]);
  }
}

async function scanRoot(dir: string, source: TemplateSource): Promise<Map<string, Found[]>> {
  const out = new Map<string, Found[]>();
  const root = await realRoot(dir);
  if (root) await walk(root, root, source, out, null);
  return out;
}

type Merged = { files: WpFiles; paths: Map<string, Found> };

async function scanDetailed(): Promise<Map<string, Merged>> {
  const [override, defaults] = await Promise.all([scanRoot(templatesRoot(), "override"), scanRoot(defaultTemplatesRoot(), "default")]);
  const result = new Map<string, Merged>();
  const codes = [...new Set([...override.keys(), ...defaults.keys()])].sort(byName);
  for (const wpCode of codes) {
    const prefix = `${wpCode}_`;
    const uniq = (list: Found[]) => [...new Map([...list].sort((a, b) => byName(a.name, b.name)).map((f) => [f.name, f])).values()];
    const o = uniq(override.get(wpCode) ?? []);
    const d = uniq(defaults.get(wpCode) ?? []);
    const oTemplates = o.filter((f) => f.name.startsWith(prefix));
    const dTemplates = d.filter((f) => f.name.startsWith(prefix));
    const templates = oTemplates.length > 0 ? oTemplates : dTemplates;
    // A default template replaced by an override template is not a sample either.
    const defaultSamples = d.filter((f) => !f.name.startsWith(prefix));
    const overrideSamples = o.filter((f) => !f.name.startsWith(prefix));
    const samples = [...new Map([...defaultSamples, ...overrideSamples].map((f) => [f.name, f])).values()].sort((a, b) =>
      byName(a.name, b.name),
    );
    const paths = new Map<string, Found>();
    for (const f of [...templates, ...samples]) paths.set(f.name, f);
    result.set(wpCode, {
      files: {
        wpCode,
        template: templates[0]?.name ?? null,
        templateSource: templates[0]?.source ?? null,
        extraTemplates: templates.slice(1).map((f) => f.name),
        samples: samples.map((f) => f.name),
      },
      paths,
    });
  }
  return result;
}

/** Every WP that has a folder under either root, merged: an override template beats the default one. */
export async function scanTemplates(): Promise<Map<string, WpFiles>> {
  return new Map([...(await scanDetailed())].map(([code, m]) => [code, m.files]));
}

/**
 * Absolute path of a listed file, or null. The name must be one the scan lists for this WP (so no separators or
 * `..`), and the file's real path must still sit inside the real root that owns it.
 */
export async function resolveTemplateFile(wpCode: string, name: string): Promise<string | null> {
  const found = (await scanDetailed()).get(wpCode)?.paths.get(name);
  if (!found) return null;
  try {
    const real = await fs.realpath(/*turbopackIgnore: true*/ found.abs);
    if (real !== found.abs || !real.startsWith(found.root + path.sep)) return null;
    return (await fs.stat(/*turbopackIgnore: true*/ real)).isFile() ? real : null;
  } catch {
    return null;
  }
}
