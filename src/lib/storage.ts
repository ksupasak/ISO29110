import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Read at call time so tests can point it elsewhere. */
function root(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.FILE_STORAGE_DIR ?? "./storage");
}

/** Resolve a storage-relative path, refusing anything that lands outside the storage root. */
function resolveInside(storedPath: string): string {
  const base = root();
  const full = path.resolve(/*turbopackIgnore: true*/ base, storedPath);
  if (path.isAbsolute(storedPath) || !full.startsWith(base + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

/** Lower-cased extension of the base name, only when it is 1-8 characters of [a-z0-9]. */
function safeExtension(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? "";
  const ext = path.extname(base).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
}

/** The stored name is a fresh UUID; nothing but a validated extension comes from user input. */
export async function saveFile(
  projectId: string,
  originalName: string,
  data: Buffer,
): Promise<{ storedPath: string; size: number }> {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error("Invalid project id");
  const storedPath = `${projectId}/${randomUUID()}${safeExtension(originalName)}`;
  const full = resolveInside(storedPath);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, data, { flag: "wx" });
  return { storedPath, size: data.length };
}

export async function openFile(storedPath: string): Promise<Buffer> {
  return readFile(/*turbopackIgnore: true*/ resolveInside(storedPath));
}

export async function deleteFile(storedPath: string): Promise<void> {
  await rm(/*turbopackIgnore: true*/ resolveInside(storedPath), { force: true });
}
