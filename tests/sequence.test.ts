import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { formatCode, nextCode } from "@/lib/sequence";

beforeEach(resetDb);

async function project(code: string) {
  return prisma.project.create({ data: { code, name: code } });
}
const issue = (projectId: string, prefix: Parameters<typeof nextCode>[2], year?: number) =>
  prisma.$transaction((tx) => nextCode(tx, projectId, prefix, year));

test("formatCode", () => {
  expect(formatCode("M", 1)).toBe("M1");
  expect(formatCode("M", 12)).toBe("M12");
  expect(formatCode("T", 1)).toBe("T-001");
  expect(formatCode("T", 1234)).toBe("T-1234");
  expect(formatCode("AG", 3)).toBe("AG-03");
  expect(formatCode("REQ-F", 1)).toBe("REQ-F01");
  expect(formatCode("REQ-N", 10)).toBe("REQ-N10");
  expect(formatCode("C", 7)).toBe("C07");
  expect(formatCode("MR", 2, 2569)).toBe("MR-2569-02");
});

test("first code per prefix is 1 and numbers increase", async () => {
  const p = await project("P1");
  expect(await issue(p.id, "M")).toBe("M1");
  expect(await issue(p.id, "M")).toBe("M2");
  expect(await issue(p.id, "T")).toBe("T-001");
  expect(await issue(p.id, "AG")).toBe("AG-01");
  expect(await issue(p.id, "REQ-F")).toBe("REQ-F01");
  expect(await issue(p.id, "REQ-N")).toBe("REQ-N01");
  expect(await issue(p.id, "C")).toBe("C01");
});

test("20 parallel calls give 20 distinct consecutive codes", async () => {
  const p = await project("P1");
  const codes = await Promise.all(Array.from({ length: 20 }, () => issue(p.id, "T")));
  expect(new Set(codes).size).toBe(20);
  expect([...codes].sort()).toEqual(Array.from({ length: 20 }, (_, i) => formatCode("T", i + 1)));
});

test("sequences are independent per project, prefix and year", async () => {
  const a = await project("A");
  const b = await project("B");
  expect(await issue(a.id, "T")).toBe("T-001");
  expect(await issue(a.id, "T")).toBe("T-002");
  expect(await issue(b.id, "T")).toBe("T-001");
  expect(await issue(a.id, "C")).toBe("C01");
  expect(await issue(a.id, "MR", 2569)).toBe("MR-2569-01");
  expect(await issue(a.id, "MR", 2569)).toBe("MR-2569-02");
  expect(await issue(a.id, "MR", 2570)).toBe("MR-2570-01");
});

test("a rolled-back transaction does not consume a number", async () => {
  const p = await project("P1");
  await expect(
    prisma.$transaction(async (tx) => {
      await nextCode(tx, p.id, "T");
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(await issue(p.id, "T")).toBe("T-001");
});

test("deleting a row does not free its number", async () => {
  const p = await project("P1");
  const code1 = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, p.id, "T");
    await tx.task.create({ data: { projectId: p.id, code, title: "a" } });
    return code;
  });
  await prisma.task.deleteMany({ where: { projectId: p.id, code: code1 } });
  const code2 = await prisma.$transaction(async (tx) => {
    const code = await nextCode(tx, p.id, "T");
    await tx.task.create({ data: { projectId: p.id, code, title: "b" } });
    return code;
  });
  expect(code1).toBe("T-001");
  expect(code2).toBe("T-002");
});

test("MR codes need a year", async () => {
  expect(() => formatCode("MR", 1)).toThrow();
  const p = await project("P1");
  await expect(issue(p.id, "MR")).rejects.toThrow();
});

async function overlap(abort: boolean) {
  const p = await project("P1");
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let aHasCode!: () => void;
  const aReady = new Promise<void>((r) => (aHasCode = r));
  const a = prisma
    .$transaction(async (tx) => {
      const code = await nextCode(tx, p.id, "T");
      aHasCode();
      await gate;
      if (abort) throw new Error("rollback A");
      return code;
    })
    .catch(() => "rolled-back");
  await aReady;
  let bDone = false;
  const b = issue(p.id, "T").then((c) => {
    bDone = true;
    return c;
  });
  await new Promise((r) => setTimeout(r, 300));
  expect(bDone).toBe(false);
  release();
  return { a: await a, b: await b };
}

test("B waits for A's open transaction and gets the next number after A commits", async () => {
  expect(await overlap(false)).toEqual({ a: "T-001", b: "T-002" });
});

test("if A rolls back, B gets the number A would have had", async () => {
  expect(await overlap(true)).toEqual({ a: "rolled-back", b: "T-001" });
});
