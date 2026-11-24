import { breadcrumbs, navSections } from "@/components/shell/nav-model";

const labels = (path: string, isAdmin: boolean) => navSections(path, isAdmin).map((s) => s.links.map((l) => l.label));

describe("navSections", () => {
  test("global links: admins also see users, non-admins do not", () => {
    expect(labels("/", true)[0]).toEqual(["โครงการ", "ผู้ใช้งาน", "ตั้งค่า AI"]);
    expect(labels("/", false)[0]).toEqual(["โครงการ"]);
  });

  test("project section is present for the project overview and its documents", () => {
    for (const path of ["/projects/ABC-1", "/projects/ABC-1/documents", "/projects/ABC-1/plan/T-001"]) {
      const sections = navSections(path, false);
      expect(sections).toHaveLength(2);
      expect(sections[1].heading).toBe("โครงการนี้");
      expect(sections[1].links.map((l) => [l.label, l.href])).toEqual([
        ["ภาพรวม", "/projects/ABC-1"],
        ["เอกสาร", "/projects/ABC-1/documents"],
        ["แผนงาน", "/projects/ABC-1/plan"],
        ["Requirement", "/projects/ABC-1/requirements"],
        ["Component", "/projects/ABC-1/components"],
      ]);
    }
  });

  test("project section marks the current page as active", () => {
    const active = (path: string) => navSections(path, false)[1].links.filter((l) => l.active).map((l) => l.label);
    expect(active("/projects/ABC-1")).toEqual(["ภาพรวม"]);
    expect(active("/projects/ABC-1/documents")).toEqual(["เอกสาร"]);
    expect(active("/projects/ABC-1/plan")).toEqual(["แผนงาน"]);
    expect(active("/projects/ABC-1/plan/T-001")).toEqual(["แผนงาน"]);
    expect(active("/projects/ABC-1/requirements")).toEqual(["Requirement"]);
    expect(active("/projects/ABC-1/requirements/REQ-F01")).toEqual(["Requirement"]);
    expect(active("/projects/ABC-1/components/C01")).toEqual(["Component"]);
  });

  test("project section is absent for the create page, which activates the project list", () => {
    const sections = navSections("/projects/new", false);
    expect(sections).toHaveLength(1);
    expect(sections[0].links[0]).toMatchObject({ label: "โครงการ", active: true });
  });

  test("a URL-encoded code is kept as-is in hrefs", () => {
    const hrefs = navSections("/projects/INT%2F2569", false)[1].links.map((l) => l.href);
    expect(hrefs).toEqual(["/projects/INT%2F2569", "/projects/INT%2F2569/documents", "/projects/INT%2F2569/plan", "/projects/INT%2F2569/requirements", "/projects/INT%2F2569/components"]);
  });
});

describe("AI settings entry", () => {
  test("admins see ตั้งค่า AI linking to /admin/ai, non-admins do not", () => {
    const link = navSections("/", true)[0].links.find((l) => l.label === "ตั้งค่า AI");
    expect(link).toMatchObject({ href: "/admin/ai", icon: "smart_toy", active: false });
    expect(navSections("/", false)[0].links.some((l) => l.href === "/admin/ai")).toBe(false);
  });

  test("is active only on /admin/ai", () => {
    const active = (path: string) => navSections(path, true)[0].links.filter((l) => l.active).map((l) => l.label);
    expect(active("/admin/ai")).toEqual(["ตั้งค่า AI"]);
    expect(active("/admin/users")).toEqual(["ผู้ใช้งาน"]);
  });
});

describe("breadcrumbs", () => {
  test("project list, users and create pages", () => {
    expect(breadcrumbs("/")).toEqual([{ label: "โครงการ" }]);
    expect(breadcrumbs("/admin/users")).toEqual([{ label: "ผู้ใช้งาน" }]);
    expect(breadcrumbs("/admin/ai")).toEqual([{ label: "ตั้งค่า AI" }]);
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

  test("plan list and task detail", () => {
    expect(breadcrumbs("/projects/ABC-1/plan")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "ABC-1", href: "/projects/ABC-1" },
      { label: "แผนงาน" },
    ]);
    expect(breadcrumbs("/projects/ABC-1/plan/T-001")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "ABC-1", href: "/projects/ABC-1" },
      { label: "แผนงาน", href: "/projects/ABC-1/plan" },
      { label: "T-001" },
    ]);
  });

  test("requirement and component pages", () => {
    expect(breadcrumbs("/projects/ABC-1/requirements")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "ABC-1", href: "/projects/ABC-1" },
      { label: "Requirement" },
    ]);
    expect(breadcrumbs("/projects/ABC-1/requirements/REQ-F01")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "ABC-1", href: "/projects/ABC-1" },
      { label: "Requirement", href: "/projects/ABC-1/requirements" },
      { label: "REQ-F01" },
    ]);
    expect(breadcrumbs("/projects/ABC-1/components/C01").at(-1)).toEqual({ label: "C01" });
  });

  test("a URL-encoded code is decoded for the label and kept encoded in the link", () => {
    expect(breadcrumbs("/projects/INT%2F2569/documents")).toEqual([
      { label: "โครงการ", href: "/" },
      { label: "INT/2569", href: "/projects/INT%2F2569" },
      { label: "เอกสาร" },
    ]);
  });
});
