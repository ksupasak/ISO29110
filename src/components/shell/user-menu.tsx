"use client";

import { useTransition } from "react";
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
      <Dropdown.Menu>
        <Dropdown.Item as="button" role="menuitem" disabled={pending} onClick={() => startTransition(() => logoutAction())}>
          <Icon name="logout" className="me-2" />
          ออกจากระบบ
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
