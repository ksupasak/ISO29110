"use client";

import { useId, useState } from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import { Icon } from "@/components/icon";
import { Breadcrumbs } from "./breadcrumbs";
import { SidebarBrand, SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

/** Admin layout: fixed sidebar on large screens, offcanvas menu below 992 px, topbar with breadcrumbs and user menu. */
export function AppShell({ user, children }: { user: { fullName: string; isAdmin: boolean }; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const closeMenu = () => setMenuOpen(false);
  return (
    <>
      <aside className="app-sidebar">
        <SidebarBrand />
        <SidebarNav isAdmin={user.isAdmin} />
      </aside>
      <Offcanvas show={menuOpen} onHide={closeMenu} placement="start" id={menuId} aria-label="เมนู" className="app-offcanvas">
        <Offcanvas.Header closeButton closeLabel="ปิด" closeVariant="white" className="border-bottom border-white border-opacity-10">
          <SidebarBrand onNavigate={closeMenu} />
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <SidebarNav isAdmin={user.isAdmin} onNavigate={closeMenu} />
        </Offcanvas.Body>
      </Offcanvas>
      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="btn btn-icon d-lg-none" aria-label="เปิดเมนู" aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <Breadcrumbs />
          <UserMenu fullName={user.fullName} />
        </header>
        <main className="app-content">{children}</main>
      </div>
    </>
  );
}
