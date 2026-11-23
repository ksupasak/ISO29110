"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type State = { error?: string; ok?: boolean; values?: Record<string, string> };

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
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel?: string;
  children: (values: Record<string, string>) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: State, fd: FormData) => {
    const next = await action(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, {} as State);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {children(state.values ?? {})}
          {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>{submitLabel}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
