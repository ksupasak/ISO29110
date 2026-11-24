export type NavLink = { href: string; label: string; icon: string; active: boolean };
export type NavSection = { heading?: string; links: NavLink[] };
export type Crumb = { label: string; href?: string };

/** The project code when the path is inside `/projects/<code>` (but not the create page), else null. */
function projectCode(pathname: string): string | null {
  const [first, code] = pathname.split("/").filter(Boolean);
  if (first !== "projects" || !code || code === "new") return null;
  return code;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function within(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar entries for the current path: the main section, plus "โครงการนี้" while inside a project. */
export function navSections(pathname: string, isAdmin: boolean): NavSection[] {
  const code = projectCode(pathname);
  const main: NavLink[] = [
    { href: "/", label: "โครงการ", icon: "folder_open", active: pathname === "/" || within(pathname, "/projects/new") },
  ];
  if (isAdmin) {
    main.push({ href: "/admin/users", label: "ผู้ใช้งาน", icon: "group", active: within(pathname, "/admin/users") });
    main.push({ href: "/admin/ai", label: "ตั้งค่า AI", icon: "smart_toy", active: within(pathname, "/admin/ai") });
    main.push({ href: "/admin/templates", label: "Template", icon: "folder_copy", active: within(pathname, "/admin/templates") });
  }
  const sections: NavSection[] = [{ links: main }];
  if (code) {
    const base = `/projects/${code}`;
    sections.push({
      heading: "โครงการนี้",
      links: [
        { href: base, label: "ภาพรวม", icon: "dashboard", active: pathname === base },
        { href: `${base}/documents`, label: "เอกสาร", icon: "description", active: within(pathname, `${base}/documents`) },
        { href: `${base}/plan`, label: "แผนงาน", icon: "account_tree", active: within(pathname, `${base}/plan`) },
        { href: `${base}/requirements`, label: "Requirement", icon: "checklist", active: within(pathname, `${base}/requirements`) },
        { href: `${base}/components`, label: "Component", icon: "widgets", active: within(pathname, `${base}/components`) },
        { href: `${base}/trace`, label: "การอ้างอิง", icon: "hub", active: within(pathname, `${base}/trace`) },
      ],
    });
  }
  return sections;
}

/** Project pages that have a list and per-item detail pages (`<section>/<code>`). */
const SECTION_TITLES: [string, string][] = [
  ["plan", "แผนงาน"],
  ["requirements", "Requirement"],
  ["components", "Component"],
];
const TRACE_TITLE = "การอ้างอิง";

/** Breadcrumb trail for the topbar; the last crumb is the current page and carries no link. */
export function breadcrumbs(pathname: string): Crumb[] {
  if (within(pathname, "/admin/users")) return [{ label: "ผู้ใช้งาน" }];
  if (within(pathname, "/admin/ai")) return [{ label: "ตั้งค่า AI" }];
  if (within(pathname, "/account/password")) return [{ label: "เปลี่ยนรหัสผ่าน" }];
  if (within(pathname, "/admin/templates")) return [{ label: "Template" }];
  if (within(pathname, "/projects/new")) return [{ label: "โครงการ", href: "/" }, { label: "สร้างโครงการ" }];
  const code = projectCode(pathname);
  if (!code) return [{ label: "โครงการ" }];
  const base = `/projects/${code}`;
  const label = decode(code);
  if (within(pathname, `${base}/documents`)) {
    return [{ label: "โครงการ", href: "/" }, { label, href: base }, { label: "เอกสาร" }];
  }
  if (within(pathname, `${base}/trace`)) return [{ label: "โครงการ", href: "/" }, { label, href: base }, { label: TRACE_TITLE }];
  for (const [segment, title] of SECTION_TITLES) {
    if (!within(pathname, `${base}/${segment}`)) continue;
    const rest = pathname.slice(`${base}/${segment}`.length).split("/").filter(Boolean);
    const crumbs: Crumb[] = [{ label: "โครงการ", href: "/" }, { label, href: base }];
    if (rest.length === 0) return [...crumbs, { label: title }];
    return [...crumbs, { label: title, href: `${base}/${segment}` }, { label: decode(rest[0]) }];
  }
  return [{ label: "โครงการ", href: "/" }, { label }];
}
