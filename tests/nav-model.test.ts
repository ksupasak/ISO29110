import { breadcrumbs, navSections } from "@/components/shell/nav-model";

const labels = (path: string, isAdmin: boolean) => navSections(path, isAdmin).map((s) => s.links.map((l) => l.label));

describe("navSections", () => {
  test("global links: admins also see users, non-admins do not", () => {
    expect(labels("/", true)[0]).toEqual(["โครงการ", "ผู้ใช้งาน"]);
    expect(labels("/", false)[0]).toEqual(["โครงการ"]);
  });

  test("project section is present for the project overview and its documents", () => {
    for (const path of ["/projects/ABC-1", "/projects/ABC-1/documents"]) {
      const sections = navSections(path, false);
      expect(sections).toHaveLength(2);
      expect(sections[1].heading).toBe("โครงการนี้");
      expect(sections[1].links.map((l) => [l.label, l.href])).toEqual([
        ["ภาพรวม", "/projects/ABC-1"],
        ["เอกสาร", "/projects/ABC-1/documents"],
      ]);
    }
  });

  test("project section marks the current page as active", () => {
    const active = (path: string) => navSections(path, false)[1].links.filter((l) => l.active).map((l) => l.label);
    expect(active("/projects/ABC-1")).toEqual(["ภาพรวม"]);
    expect(active("/projects/ABC-1/documents")).toEqual(["เอกสาร"]);
  });

  test("project section is absent for the create page, which activates the project list", () => {
    const sections = navSections("/projects/new", false);
    expect(sections).toHaveLength(1);
    expect(sections[0].links[0]).toMatchObject({ label: "โครงการ", active: true });
  });

  test("a URL-encoded code is kept as-is in hrefs", () => {
    const hrefs = navSections("/projects/INT%2F2569", false)[1].links.map((l) => l.href);
    expect(hrefs).toEqual(["/projects/INT%2F2569", "/projects/INT%2F2569/documents"]);
  });
});

describe("breadcrumbs", () => {
  test("project list, users and create pages", () => {
    expect(breadcrumbs("/")).toEqual([{ label: "โครงการ" }]);
    expect(breadcrumbs("/admin/users")).toEqual([{ label: "ผู้ใช้งาน" }]);
    expect(breadcrumbs("/projects/new")).toEqual([{ label: "โครงการ", href: "/" }, { label: "สร้างโครงการ" }]);
  });

  test("project overview and documents", () => {
    expect(breadcrumbs("/projects/ABC-1")).toEqual([{ label: "โครงการ", href: "/" }, { label: "ABC-1" }]);
    expect(breadcrumbs("/projects/ABC-1/documents")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "ABC-1", href: "/projects/ABC-1" },
      { label: "เอกสาร" },
    ]);
  });

  test("a URL-encoded code is decoded for the label and kept encoded in the link", () => {
    expect(breadcrumbs("/projects/INT%2F2569/documents")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "INT/2569", href: "/projects/INT%2F2569" },
      { label: "เอกสาร" },
    ]);
  });
});
