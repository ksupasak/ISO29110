import { WP_CATALOG, PHASES, FINAL_STATUSES, getWp, isFinalStatus } from "@/lib/wp-catalog";

test("23 work products, unique codes WP01..WP23, seq 1..23", () => {
  expect(WP_CATALOG).toHaveLength(23);
  expect(new Set(WP_CATALOG.map((w) => w.code)).size).toBe(23);
  expect(WP_CATALOG.map((w) => w.seq)).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
});

test("phase membership matches the standard", () => {
  expect(PHASES).toHaveLength(9);
  expect(getWp("WP14").phaseNo).toBe(7);
  expect(getWp("WP21").phaseNo).toBe(4);
  expect(WP_CATALOG.filter((w) => w.phaseNo === 2).map((w) => w.code)).toEqual([
    "WP07",
    "WP09",
    "WP03",
    "WP04",
    "WP23",
    "WP22",
  ]);
});

test("unknown code throws", () => {
  expect(() => getWp("WP99")).toThrow();
});

test("isFinalStatus recognises the seven final statuses only", () => {
  for (const s of FINAL_STATUSES) expect(isFinalStatus(s)).toBe(true);
  expect(FINAL_STATUSES).toHaveLength(7);
  for (const s of ["Draft", "Verified", "Reviewed"]) expect(isFinalStatus(s)).toBe(false);
});
