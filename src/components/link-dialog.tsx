"use client";

import { FormDialog } from "@/components/form-dialog";

type State = { error?: string; ok?: boolean; values?: Record<string, string> };

export type LinkGroup = {
  /** Form field name; every ticked option is submitted under it. */
  name: string;
  legend: string;
  options: { id: string; label: string }[];
  selected: string[];
};

/** Dialog with one scrollable checkbox list per group, for replacing a set of links. */
export function LinkDialog({
  title = "แก้การอ้างอิง",
  action,
  hidden,
  groups,
}: {
  title?: string;
  action: (prev: State, fd: FormData) => Promise<State>;
  /** Hidden fields identifying the item being edited. */
  hidden: Record<string, string>;
  groups: LinkGroup[];
}) {
  return (
    <FormDialog title={title} trigger={title} triggerIcon="link" action={action}>
      {() => (
        <>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {groups.map((g) => (
            <fieldset key={g.name}>
              <legend className="form-label small fw-medium text-body-secondary">{g.legend}</legend>
              {g.options.length === 0 ? (
                <p className="small text-body-secondary mb-0">ยังไม่มีรายการ</p>
              ) : (
                <div className="link-options border rounded p-2 d-grid gap-1">
                  {g.options.map((o) => (
                    <div key={o.id} className="form-check">
                      <input
                        id={`${g.name}-${o.id}`}
                        type="checkbox"
                        className="form-check-input"
                        name={g.name}
                        value={o.id}
                        defaultChecked={g.selected.includes(o.id)}
                      />
                      <label htmlFor={`${g.name}-${o.id}`} className="form-check-label">{o.label}</label>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </>
      )}
    </FormDialog>
  );
}
