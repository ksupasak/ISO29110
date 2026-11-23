import { beforeEach, describe, expect, test } from "vitest";
import { resetDb } from "./setup/db";
import { deleteFile, openFile, saveFile } from "@/lib/storage";

beforeEach(async () => {
  await resetDb();
});

describe("storage", () => {
  test("stored name ignores user input; traversal impossible", async () => {
    const a = await saveFile("proj1", "../../etc/passwd", Buffer.from("x"));
    expect(a.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}$/);
    const b = await saveFile("proj1", "แผนงาน โครงการ v1.0.DOCX", Buffer.from("hello"));
    expect(b.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}\.docx$/);
    expect(b.size).toBe(5);
    expect((await openFile(b.storedPath)).toString()).toBe("hello");
    await expect(openFile("../.env")).rejects.toThrow();
    await expect(openFile("proj1/../../.env")).rejects.toThrow();
    await expect(openFile("/etc/passwd")).rejects.toThrow();
  });

  test("odd extensions are dropped", async () => {
    const long = await saveFile("proj1", "a.verylongext1", Buffer.from("x"));
    expect(long.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}$/);
    const odd = await saveFile("proj1", "a.p/d f", Buffer.from("x"));
    expect(odd.storedPath).toMatch(/^proj1\/[0-9a-f-]{36}$/);
  });

  test("project id cannot escape the storage directory", async () => {
    await expect(saveFile("../x", "a.txt", Buffer.from("x"))).rejects.toThrow();
  });

  test("deleteFile removes the file and tolerates missing files", async () => {
    const a = await saveFile("proj1", "a.txt", Buffer.from("x"));
    await deleteFile(a.storedPath);
    await expect(openFile(a.storedPath)).rejects.toThrow();
    await expect(deleteFile(a.storedPath)).resolves.toBeUndefined();
    await expect(deleteFile("../.env")).rejects.toThrow();
  });
});
