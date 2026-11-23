import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/result";
test("database is reachable", async () => {
  const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT 1::int AS n`;
  expect(rows[0].n).toBe(1);
});
test("result helpers", () => {
  expect(ok(5)).toEqual({ ok: true, data: 5 });
  expect(fail("x")).toEqual({ ok: false, error: "x" });
});
