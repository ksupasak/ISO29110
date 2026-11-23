/** Page title row with optional actions aligned to the right. */
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {children && <div className="d-flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
