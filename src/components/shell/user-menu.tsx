"use client";

import { useTransition } from "react";
import Link from "next/link";
import Dropdown from "react-bootstrap/Dropdown";
import { logoutAction } from "@/features/auth/actions";
import { Icon } from "@/components/icon";

export function UserMenu({ fullName }: { fullName: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dropdown align="end">
      <Dropdown.Toggle variant="light" className="user-menu-toggle">
        <span className="user-avatar" aria-hidden="true">{fullName.trim().charAt(0)}</span>
        <span className="user-menu-name">{fullName}</span>
        <Icon name="expand_more" />
      </Dropdown.Toggle>
      <Dropdown.Menu role="menu">
        <Dropdown.Item as={Link} href="/account/password" role="menuitem">
          <Icon name="key" className="me-2" />
          เปลี่ยนรหัสผ่าน
        </Dropdown.Item>
        <Dropdown.Item as="button" role="menuitem" disabled={pending} onClick={() => startTransition(() => logoutAction())}>
          <Icon name="logout" className="me-2" />
          ออกจากระบบ
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
