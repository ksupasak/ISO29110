"use client";

import { useActionState, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import { Icon } from "@/components/icon";
import { IconButton } from "@/components/icon-button";

type State = { error?: string; ok?: boolean; values?: Record<string, string> };
type Action = (prev: State, formData: FormData) => Promise<State>;
type Fields = (values: Record<string, string>) => React.ReactNode;

/** Dialog that submits a server action and closes itself on success; `children` receives the echoed values after an error. */
export function FormDialog({
  title,
  trigger,
  action,
  submitLabel = "บันทึก",
  triggerIcon,
  triggerVariant = "outline-primary",
  iconOnly = false,
  children,
}: {
  title: string;
  trigger: string;
  action: Action;
  submitLabel?: string;
  /** Material Symbols name shown in the trigger button. */
  triggerIcon?: string;
  triggerVariant?: "outline-primary" | "primary";
  /** Row-action style: show only `triggerIcon`, keeping `trigger` as accessible name and tooltip. Needs `triggerIcon`. */
  iconOnly?: boolean;
  children: Fields;
}) {
  const [open, setOpen] = useState(false);
  // Every opening mounts a fresh form, so an error or echoed values from a cancelled attempt never reappear.
  const [session, setSession] = useState(0);
  const titleId = useId();
  const openDialog = () => {
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <>
      {iconOnly && triggerIcon ? (
        <IconButton icon={triggerIcon} label={trigger} onClick={openDialog} />
      ) : (
        <Button variant={triggerVariant} size={triggerVariant === "primary" ? undefined : "sm"} onClick={openDialog}>
          {triggerIcon && <Icon name={triggerIcon} />}
          {trigger}
        </Button>
      )}
      <Modal show={open} onHide={() => setOpen(false)} centered aria-labelledby={titleId}>
        <Modal.Header closeButton closeLabel="ปิด">
          <Modal.Title id={titleId} as="h2" className="h5">{title}</Modal.Title>
        </Modal.Header>
        <DialogForm key={session} action={action} submitLabel={submitLabel} onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)}>
          {children}
        </DialogForm>
      </Modal>
    </>
  );
}

function DialogForm({
  action,
  submitLabel,
  onSuccess,
  onCancel,
  children,
}: {
  action: Action;
  submitLabel: string;
  onSuccess: () => void;
  onCancel: () => void;
  children: Fields;
}) {
  const [state, formAction, pending] = useActionState(async (prev: State, fd: FormData) => {
    const next = await action(prev, fd);
    if (next.ok) onSuccess();
    return next;
  }, {} as State);
  return (
    <form action={formAction}>
      <Modal.Body className="d-grid gap-3">
        {children(state.values ?? {})}
        {state.error && <div role="alert" className="alert alert-danger py-2 small mb-3">{state.error}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="link" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" disabled={pending}>{submitLabel}</Button>
      </Modal.Footer>
    </form>
  );
}
