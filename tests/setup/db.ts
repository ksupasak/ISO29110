import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

function storageDir(): string {
  return path.resolve(process.env.FILE_STORAGE_DIR ?? "./test-storage");
}

/** Refuse to touch any database whose name does not end with `_test`. */
export function assertTestDatabaseUrl(url: string | undefined): void {
  let name = "";
  try {
    name = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    // fall through to the error below
  }
  if (!name.endsWith("_test")) throw new Error("resetDb refused: the database name in DATABASE_URL must end with _test");
}

/** Refuse to empty any directory that is not named `test-storage`. */
export function assertTestStorageDir(dir: string): void {
  if (path.basename(path.resolve(dir)) !== "test-storage") {
    throw new Error("resetDb refused: the storage directory must be named test-storage");
  }
}

export async function resetDb(): Promise<void> {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  assertTestStorageDir(storageDir());
  // A test trigger (tests/meetings.test.ts) left behind by a killed run must not poison later runs.
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_attachment ON "Attachment"`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
  await rm(storageDir(), { recursive: true, force: true });
  await mkdir(storageDir(), { recursive: true });
}

async function countFiles(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
  let n = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    n += entry.isDirectory() ? await countFiles(full) : 1;
  }
  return n;
}

export async function countStoredFiles(projectId: string): Promise<number> {
  return countFiles(path.join(storageDir(), projectId));
}
