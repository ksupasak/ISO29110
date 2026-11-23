import { docStatusVariant, projectStatusVariant } from "@/lib/labels";
test.each([
  ["Draft", "secondary"], ["Reviewed", "info"], ["Verified", "info"], ["Initiated", "info"], ["Unit tested", "info"],
  ["Approved", "success"], ["Baselined", "success"], ["Accepted", "success"], ["Signed", "success"],
  ["Published", "success"], ["Completed", "success"], ["Rejected", "danger"],
  ["SomethingNew", "info"], ["", "info"],
])("docStatusVariant(%s) = %s", (s, v) => expect(docStatusVariant(s)).toBe(v));
test("projectStatusVariant", () => {
  expect(projectStatusVariant("PLANNING")).toBe("info");
  expect(projectStatusVariant("ACTIVE")).toBe("success");
  expect(projectStatusVariant("CLOSED")).toBe("secondary");
});
