"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/icon-button";

/** Row-action delete with a confirm step and the service's error shown under the button; `redirectTo` leaves a detail page after success. */
export function DeleteButton({
  label = "ลบ",
  confirmText,
  action,
  redirectTo,
}: {
  label?: string;
  confirmText: string;
  action: () => Promise<{ ok?: boolean; error?: string }>;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <IconButton
        icon="delete"
        label={label}
        tone="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          startTransition(async () => {
            const r = await action();
            setError(r.error ?? null);
            if (r.ok && redirectTo) router.push(redirectTo);
          });
        }}
      />
      {error && <div role="alert" className="row-error small text-danger">{error}</div>}
    </>
  );
}
