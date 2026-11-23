"use client";

import { useState, useTransition } from "react";
import { addAttachmentAction, setStatusAction, uploadVersionAction } from "@/features/documents/actions";
import { FormDialog } from "@/components/form-dialog";
import { FileField, FloatingField, FloatingSelect } from "@/components/form-fields";
import { ATTACHMENT_KIND_LABEL } from "@/lib/labels";
import { FILE_TOO_LARGE_MESSAGE, MAX_FILE_BYTES } from "@/lib/upload-limits";

type FormState = Awaited<ReturnType<typeof uploadVersionAction>>;

/** Rejects an oversize file in the browser, before anything is sent to the server. */
function withSizeCheck(action: (prev: FormState, fd: FormData) => Promise<FormState>, textFields: string[]) {
  return async (prev: FormState, fd: FormData): Promise<FormState> => {
    const f = fd.get("file");
    if (f instanceof File && f.size > MAX_FILE_BYTES) {
      const values: Record<string, string> = {};
      for (const k of textFields) values[k] = String(fd.get(k) ?? "");
      return { error: FILE_TOO_LARGE_MESSAGE, values };
    }
    return action(prev, fd);
  };
}

const uploadWithCheck = withSizeCheck(uploadVersionAction, ["version", "note"]);
const attachWithCheck = withSizeCheck(addAttachmentAction, ["kind"]);

export function UploadVersionDialog({ projectId, wpCode, label }: { projectId: string; wpCode: string; label: string }) {
  return (
    <FormDialog title={`อัปโหลดเวอร์ชันใหม่ ${label}`} trigger="อัปโหลดเวอร์ชันใหม่" action={uploadWithCheck} submitLabel="อัปโหลด" triggerIcon="upload_file">
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="wpCode" value={wpCode} />
          <FloatingField id={`version-${wpCode}`} name="version" label="เวอร์ชัน (เช่น 1.0)" required defaultValue={v.version} placeholder="1.0" />
          <FloatingField id={`note-${wpCode}`} name="note" label="หมายเหตุ" defaultValue={v.note} />
          <FileField id={`file-${wpCode}`} name="file" label="ไฟล์ (ไม่เกิน 50 MB)" required />
        </>
      )}
    </FormDialog>
  );
}

export function AttachEvidenceDialog({ projectId, entityId, wpCode }: { projectId: string; entityId: string; wpCode: string }) {
  return (
    <FormDialog title={`แนบหลักฐาน ${wpCode}`} trigger="แนบหลักฐาน" action={attachWithCheck} submitLabel="แนบไฟล์" triggerIcon="attach_file">
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="entityId" value={entityId} />
          <FloatingSelect id={`kind-${wpCode}`} name="kind" label="ประเภท" defaultValue={v.kind ?? "SIGNED"}>
            {(Object.keys(ATTACHMENT_KIND_LABEL) as (keyof typeof ATTACHMENT_KIND_LABEL)[]).map((k) => (
              <option key={k} value={k}>{ATTACHMENT_KIND_LABEL[k]}</option>
            ))}
          </FloatingSelect>
          <FileField id={`attfile-${wpCode}`} name="file" label="ไฟล์ (ไม่เกิน 50 MB)" required />
        </>
      )}
    </FormDialog>
  );
}

export function StatusSelect({
  projectId,
  wpCode,
  status,
  options,
}: {
  projectId: string;
  wpCode: string;
  status: string;
  /** Only statuses the viewer may set, plus the current one. */
  options: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="d-inline-flex align-items-center gap-2">
      <select
        aria-label={`สถานะ ${wpCode}`}
        value={status}
        disabled={pending}
        className="form-select form-select-sm w-auto"
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            const r = await setStatusAction(projectId, wpCode, next);
            setError(r.error ?? null);
          });
        }}
      >
        {options.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <span role="alert" className="text-danger small">{error}</span>}
    </span>
  );
}
