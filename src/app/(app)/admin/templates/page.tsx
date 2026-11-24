import { requireAdmin } from "@/lib/auth/current-user";
import { scanTemplates, templatesRoot } from "@/lib/template-store";
import { WP_CATALOG } from "@/lib/wp-catalog";
import { AppCard } from "@/components/app-card";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-badge";

export default async function TemplatesPage() {
  await requireAdmin();
  const files = await scanTemplates();
  return (
    <>
      <PageHeader title="Template" />
      <AppCard title="คลัง template" icon="folder_copy">
        <div className="card-body">
          <p className="mb-0 small">
            โฟลเดอร์ที่ใช้อยู่: <code data-testid="templates-dir">{templatesRoot()}</code>
          </p>
          {files.size === 0 && (
            <div className="alert alert-danger py-2 small mt-3 mb-0">ไม่พบโฟลเดอร์ template หรืออ่านไม่ได้</div>
          )}
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">WP</th>
                <th scope="col">ไฟล์ template</th>
                <th scope="col" className="d-none d-md-table-cell">หมายเหตุ</th>
                <th scope="col" className="text-end">ตัวอย่าง</th>
              </tr>
            </thead>
            <tbody>
              {WP_CATALOG.map((wp) => {
                const f = files.get(wp.code);
                return (
                  <tr key={wp.code}>
                    <td className="text-nowrap fw-medium">{wp.code} {wp.name}</td>
                    <td className="text-break">{f?.template ?? ""}</td>
                    <td className="d-none d-md-table-cell">
                      {!f?.template && <StatusChip variant="warning">ยังไม่มี template</StatusChip>}
                      {f && f.extraTemplates.length > 0 && (
                        <StatusChip variant="warning">{`มี template เกิน 1 ไฟล์: ${f.extraTemplates.join(", ")}`}</StatusChip>
                      )}
                    </td>
                    <td className="text-end">{f?.samples.length ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AppCard>
    </>
  );
}
