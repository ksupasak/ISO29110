"use client";

import { useActionState, useId, useState } from "react";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";

type State = { error?: string; ok?: boolean; values?: Record<string, string> };
type Action = (prev: State, formData: FormData) => Promise<State>;
type Fields = (values: Record<string, string>) => React.ReactNode;

/** Dialog that submits a server action and closes itself on success; `children` receives the echoed values after an error. */
export function FormDialog({
  title,
  trigger,
  action,
  submitLabel = "บันทึก",
  children,
}: {
  title: string;
  trigger: string;
  action: Action;
  submitLabel?: string;
  children: Fields;
}) {
  const [open, setOpen] = useState(false);
  // Every opening mounts a fresh form, so an error or echoed values from a cancelled attempt never reappear.
  const [session, setSession] = useState(0);
  const titleId = useId();
  return (
    <>
      <Button
        variant="outline-primary"
        size="sm"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      <Modal show={open} onHide={() => setOpen(false)} centered aria-labelledby={titleId}>
        <Modal.Header closeButton>
          <Modal.Title id={titleId} as="h2" className="h5">{title}</Modal.Title>
        </Modal.Header>
        <DialogForm key={session} action={action} submitLabel={submitLabel} onSuccess={() => setOpen(false)}>
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
  children,
}: {
  action: Action;
  submitLabel: string;
  onSuccess: () => void;
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
        {state.error && <p role="alert" className="text-danger small mb-0">{state.error}</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button type="submit" variant="primary" disabled={pending}>{submitLabel}</Button>
      </Modal.Footer>
    </form>
  );
}
