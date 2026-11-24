import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-user";
import { defaultTemplatesRoot, scanTemplates, templatesRoot } from "@/lib/template-store";
import { WP_CATALOG } from "@/lib/wp-catalog";
import { AppCard } from "@/components/app-card";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-badge";
import { GENERATED_WPS, checkTemplate, type TemplateCheck } from "@/features/docgen/registry";

export default async function TemplatesPage() {
  await requireAdmin();
  const files = await scanTemplates();
  // Read fresh on every request, so reloading the page re-checks an edited template.
  const checks = new Map<string, TemplateCheck>(
    await Promise.all(Object.keys(GENERATED_WPS).map(async (code) => [code, await checkTemplate(code)] as const)),
  );
  return (
    <>
      <PageHeader title="Template">
        <Link href="/admin/templates" prefetch={false} className="btn btn-outline-primary btn-sm">
          ตรวจอีกครั้ง
        </Link>
      </PageHeader>
      <div className="d-grid gap-4">
        <AppCard title="คลัง template" icon="folder_copy">
          <div className="card-body">
            {files.size === 0 && (
              <div className="alert alert-danger py-2 small mb-3">ไม่พบโฟลเดอร์ template หรืออ่านไม่ได้</div>
            )}
            <p className="mb-1 small">
              โฟลเดอร์ที่แก้ไขได้ (override): <code data-testid="templates-dir">{templatesRoot()}</code>
            </p>
            <p className="mb-0 small">
              โฟลเดอร์ค่าเริ่มต้น (มากับระบบ): <code data-testid="templates-default-dir">{defaultTemplatesRoot()}</code>
            </p>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th scope="col">WP</th>
                  <th scope="col">ไฟล์ template</th>
                  <th scope="col" className="d-none d-md-table-cell">หมายเหตุ</th>
                  <th scope="col">ผลตรวจ</th>
                  <th scope="col" className="text-end">ตัวอย่าง</th>
                </tr>
              </thead>
              <tbody>
                {WP_CATALOG.map((wp) => {
                  const f = files.get(wp.code);
                  const check = checks.get(wp.code);
                  return (
                    <tr key={wp.code} data-testid={check ? `template-row-${wp.code}` : undefined}>
                      <td className="text-nowrap fw-medium">{wp.code} {wp.name}</td>
                      <td className="text-break">
                        {f?.template ?? ""}
                        {f?.templateSource && (
                          <span className="ms-2">
                            <StatusChip variant={f.templateSource === "override" ? "info" : "secondary"}>
                              {f.templateSource === "override" ? "แก้ไขแล้ว" : "ค่าเริ่มต้น"}
                            </StatusChip>
                          </span>
                        )}
                      </td>
                      <td className="d-none d-md-table-cell">
                        {!f?.template && <StatusChip variant="warning">ยังไม่มี template</StatusChip>}
                        {f && f.extraTemplates.length > 0 && (
                          <StatusChip variant="warning">{`มี template เกิน 1 ไฟล์: ${f.extraTemplates.join(", ")}`}</StatusChip>
                        )}
                      </td>
                      <td data-testid={check ? `template-check-${wp.code}` : undefined}>
                        {check?.ok && <StatusChip variant="success">ผ่าน</StatusChip>}
                        {check && !check.ok && (
                          <>
                            <StatusChip variant="danger">ไม่ผ่าน</StatusChip>
                            <ul className="small text-danger mb-0 mt-1 ps-3">
                              {check.problems.map((problem) => (
                                <li key={problem}>{problem}</li>
                              ))}
                            </ul>
                          </>
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
        {Object.values(GENERATED_WPS).map((g) => {
          const name = WP_CATALOG.find((wp) => wp.code === g.wpCode)?.name ?? "";
          return (
            <AppCard key={g.wpCode} title={`เครื่องหมายของ ${g.wpCode} ${name}`} icon="sell">
              <div className="table-responsive">
                <table className="table align-middle" data-testid={`template-tags-${g.wpCode}`}>
                  <thead>
                    <tr>
                      <th scope="col">เครื่องหมาย</th>
                      <th scope="col">ความหมาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.tags.map((t) => (
                      <tr key={`${t.loop ?? ""}.${t.name}`}>
                        <td className="text-nowrap">
                          {t.loop && <span className="text-muted me-2">↳</span>}
                          <code>{`{${t.name}}`}</code>
                          {t.loop && <span className="small text-muted ms-2">{`ในรายการ ${t.loop}`}</span>}
                        </td>
                        <td>{t.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AppCard>
          );
        })}
      </div>
    </>
  );
}
