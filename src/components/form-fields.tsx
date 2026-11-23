type FieldBase = { id: string; label: string; name?: string };

/** Floating-label text input; `name` defaults to `id`. */
export function FloatingField({ id, label, name = id, placeholder, ...props }: FieldBase & React.ComponentProps<"input">) {
  return (
    <div className="form-floating">
      <input id={id} name={name} className="form-control" placeholder={placeholder ?? label} {...props} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** Floating-label textarea. */
export function FloatingTextarea({ id, label, name = id, rows = 4, ...props }: FieldBase & React.ComponentProps<"textarea">) {
  return (
    <div className="form-floating">
      <textarea id={id} name={name} rows={rows} className="form-control form-control-textarea" placeholder={label} {...props} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** Floating-label select; options go in as children. */
export function FloatingSelect({ id, label, name = id, children, ...props }: FieldBase & React.ComponentProps<"select">) {
  return (
    <div className="form-floating">
      <select id={id} name={name} className="form-select" {...props}>
        {children}
      </select>
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** File input with a plain label above it (floating labels do not suit file pickers). */
export function FileField({ id, label, name = id, ...props }: FieldBase & React.ComponentProps<"input">) {
  return (
    <div>
      <label htmlFor={id} className="form-label small fw-medium text-body-secondary">{label}</label>
      <input id={id} name={name} type="file" className="form-control" {...props} />
    </div>
  );
}
