"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { navSections } from "./nav-model";

/** Navigation list shared by the fixed sidebar and the mobile offcanvas. */
export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="เมนูหลัก">
      {navSections(pathname, isAdmin).map((section) => (
        <div key={section.heading ?? "main"}>
          {section.heading && <div className="sidebar-section">{section.heading}</div>}
          {section.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={link.active ? "sidebar-link active" : "sidebar-link"}
              aria-current={link.active ? "page" : undefined}
              onClick={onNavigate}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" className="sidebar-brand" onClick={onNavigate}>
      <span className="sidebar-brand-mark">
        <Icon name="verified" />
      </span>
      <span>
        <span className="sidebar-brand-name">ESM Project</span>
        <span className="sidebar-brand-sub">ISO/IEC 29110</span>
      </span>
    </Link>
  );
}
