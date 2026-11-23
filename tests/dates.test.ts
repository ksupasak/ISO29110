import { formatThaiDate } from "@/lib/dates";

test("Buddhist year, zero padded", () => {
  expect(formatThaiDate(new Date("2026-11-23T00:00:00+07:00"))).toBe("23/11/2569");
  expect(formatThaiDate(new Date("2027-01-05T00:00:00+07:00"))).toBe("05/01/2570");
  expect(formatThaiDate(null)).toBe("");
});
