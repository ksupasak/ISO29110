import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveTemplateFile, scanTemplates } from "@/lib/template-store";
import { WP_CATALOG } from "@/lib/wp-catalog";

let root: string;
const saved = process.env.TEMPLATES_DIR;

function touch(...parts: string[]) {
  const file = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
  return file;
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tpl-")));
  process.env.TEMPLATES_DIR = root;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (saved === undefined) delete process.env.TEMPLATES_DIR;
  else process.env.TEMPLATES_DIR = saved;
});

test("template starts with WPnn_, other files are samples; nested phase folders work", async () => {
  touch("01_Planning (PM.01)", "01_WP02_Agreement", "WP02_agreement.docx");
  touch("01_Planning (PM.01)", "01_WP02_Agreement", "INT-2569-001_Agreement_v1.0.docx");
  const map = await scanTemplates();
  expect(map.get("WP02")).toEqual({
    wpCode: "WP02",
    template: "WP02_agreement.docx",
    extraTemplates: [],
    samples: ["INT-2569-001_Agreement_v1.0.docx"],
  });
});

test("two templates: first by name is the template, the rest are extras", async () => {
  touch("WP05_env", "WP05_b.docx");
  touch("WP05_env", "WP05_a.docx");
  const wp = (await scanTemplates()).get("WP05")!;
  expect(wp.template).toBe("WP05_a.docx");
  expect(wp.extraTemplates).toEqual(["WP05_b.docx"]);
});

test("a WP folder with only samples has no template", async () => {
  touch("WP09_x", "sample.docx");
  const wp = (await scanTemplates()).get("WP09")!;
  expect(wp.template).toBeNull();
  expect(wp.samples).toEqual(["sample.docx"]);
});

test("dotfiles, ~$ lock files, subdirectories and files outside WP folders are skipped", async () => {
  touch("WP07_mr", "WP07_t.docx");
  touch("WP07_mr", "~$WP07_t.docx");
  touch("WP07_mr", ".DS_Store");
  touch("WP07_mr", "sub", "inner.docx");
  touch("loose.docx");
  const map = await scanTemplates();
  expect(map.get("WP07")).toEqual({ wpCode: "WP07", template: "WP07_t.docx", extraTemplates: [], samples: [] });
  expect([...map.keys()]).toEqual(["WP07"]);
});

test("symlinked files are not listed as regular files", async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-out-"));
  try {
    fs.writeFileSync(path.join(outside, "secret.docx"), "s");
    touch("WP07_mr", "WP07_t.docx");
    fs.symlinkSync(path.join(outside, "secret.docx"), path.join(root, "WP07_mr", "link.docx"));
    const wp = (await scanTemplates()).get("WP07")!;
    expect(wp.samples).toEqual([]);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("missing or unreadable TEMPLATES_DIR gives an empty map", async () => {
  process.env.TEMPLATES_DIR = path.join(root, "nope");
  expect((await scanTemplates()).size).toBe(0);
  process.env.TEMPLATES_DIR = touch("afile.txt");
  expect((await scanTemplates()).size).toBe(0);
  expect(await resolveTemplateFile("WP07", "x.docx")).toBeNull();
});

test("no caching: a file added after the first scan appears", async () => {
  touch("WP07_mr", "WP07_t.docx");
  expect((await scanTemplates()).get("WP07")!.samples).toEqual([]);
  touch("WP07_mr", "added.docx");
  expect((await scanTemplates()).get("WP07")!.samples).toEqual(["added.docx"]);
});

test("resolveTemplateFile returns the absolute path for listed files only", async () => {
  const t = touch("WP07_mr", "WP07_t.docx");
  const s = touch("WP07_mr", "sample.docx");
  touch("WP08_x", "WP08_t.docx");
  expect(await resolveTemplateFile("WP07", "WP07_t.docx")).toBe(t);
  expect(await resolveTemplateFile("WP07", "sample.docx")).toBe(s);
  expect(await resolveTemplateFile("WP07", "WP08_t.docx")).toBeNull();
  expect(await resolveTemplateFile("WP07", "nothere.docx")).toBeNull();
  expect(await resolveTemplateFile("WP99", "WP07_t.docx")).toBeNull();
});

test("resolveTemplateFile rejects traversal, absolute paths and escaping symlinks", async () => {
  touch("WP07_mr", "WP07_t.docx");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tpl-out-"));
  try {
    fs.writeFileSync(path.join(outside, "secret.docx"), "s");
    expect(await resolveTemplateFile("WP07", "../../etc/passwd")).toBeNull();
    expect(await resolveTemplateFile("WP07", "../WP07_mr/WP07_t.docx")).toBeNull();
    expect(await resolveTemplateFile("WP07", path.join(outside, "secret.docx"))).toBeNull();
    expect(await resolveTemplateFile("WP07", "/etc/passwd")).toBeNull();
    // folder symlink pointing outside the root: its files must not be served
    fs.symlinkSync(outside, path.join(root, "WP08_link"));
    expect((await scanTemplates()).get("WP08")).toBeUndefined();
    expect(await resolveTemplateFile("WP08", "secret.docx")).toBeNull();
    // a file swapped for a symlink after the scan is still refused by the realpath check
    const file = path.join(root, "WP07_mr", "WP07_t.docx");
    fs.rmSync(file);
    fs.symlinkSync(path.join(outside, "secret.docx"), file);
    expect(await resolveTemplateFile("WP07", "WP07_t.docx")).toBeNull();
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("the repo's own templates/ has a template for each of the 23 WPs", async () => {
  process.env.TEMPLATES_DIR = path.join(process.cwd(), "templates");
  const map = await scanTemplates();
  for (const wp of WP_CATALOG) {
    expect(map.get(wp.code)?.template, wp.code).toBeTruthy();
    expect(map.get(wp.code)?.extraTemplates, wp.code).toEqual([]);
  }
});
