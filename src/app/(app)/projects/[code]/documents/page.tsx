import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { ATTACHMENT_KIND_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { isFinalStatus } from "@/lib/wp-catalog";
import { listDocuments } from "@/features/documents/service";
import { scanTemplates } from "@/lib/template-store";
import { Icon } from "@/components/icon";
import { DocStatusBadge, StatusChip } from "@/components/status-badge";
import { AttachEvidenceDialog, StatusSelect, UploadVersionDialog } from "./doc-controls";
import { PhaseAccordion, PhaseItem, WpRow } from "./wp-accordion";

const pad = (n: number) => String(n).padStart(2, "0");

const KIND_VARIANT = { SIGNED: "success", EVIDENCE: "info", OTHER: "secondary" } as const;

export default async function DocumentsPage({ params }: PageProps<"/projects/[code]/documents">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const actor = await getActor(user, project.id);
  const canUpload = can(actor, "document.upload");
  const canAttach = can(actor, "attachment.add");
  const canSetStatus = can(actor, "document.setStatus");
  const canBaseline = can(actor, "document.baseline");
  const phases = await listDocuments(user, project.id);
  const templates = await scanTemplates();

  return (
    <PhaseAccordion phaseKeys={phases.map(({ phase }) => String(phase.no))}>
      {phases.map(({ phase, items }) => (
        <PhaseItem
          key={phase.no}
          eventKey={String(phase.no)}
          title={`${pad(phase.no)} ${phase.folder} (${phase.process})`}
          count={items.length}
        >
          {items.map((item) => {
            const label = `${pad(item.wp.seq)} · ${item.wp.code} ${item.wp.name}`;
            // Final statuses (and leaving one) are for roles with document.baseline only.
            const locked = !canBaseline && isFinalStatus(item.status);
            const options = ["Draft", ...item.wp.states].filter(
              (s) => s === item.status || canBaseline || !isFinalStatus(s),
            );
            const tpl = templates.get(item.wp.code);
            const samples = tpl?.samples ?? [];
            const download = (name: string) => `/api/templates/${item.wp.code}/${encodeURIComponent(name)}`;
            const toggleParts = [
              samples.length > 0 ? `ตัวอย่าง (${samples.length})` : null,
              item.versions.length > 0 ? `ประวัติเวอร์ชัน (${item.versions.length})` : null,
              item.attachments.length > 0 ? `ไฟล์แนบ (${item.attachments.length})` : null,
            ].filter((part): part is string => part !== null);
            const toggleLabel = toggleParts.length > 0 ? toggleParts.join(" · ") : null;
            return (
              <WpRow
                key={item.id}
                title={label}
                toggleLabel={toggleLabel}
                meta={
                  <>
                    <DocStatusBadge status={item.status} />
                    <span className="small text-body-secondary">
                      {item.currentVersion ? `เวอร์ชันปัจจุบัน ${item.currentVersion}` : "ยังไม่มีไฟล์"}
                    </span>
                    {item.wp.generated && <StatusChip variant="primary">ระบบสร้างให้</StatusChip>}
                  </>
                }
                actions={
                  <>
                    {tpl?.template && (
                      <a className="btn btn-outline-primary btn-sm" href={download(tpl.template)}>
                        <Icon name="download" className="me-1" />
                        ดาวน์โหลด template
                      </a>
                    )}
                    {item.wp.code === "WP07" && (
                      <Link className="btn btn-outline-primary btn-sm" href={`/projects/${project.code}/meetings`}>
                        <Icon name="groups" className="me-1" />
                        ไปที่การประชุม
                      </Link>
                    )}
                    {canSetStatus && !locked && (
                      <StatusSelect projectId={project.id} wpCode={item.wp.code} status={item.status} options={options} />
                    )}
                    {canUpload && <UploadVersionDialog projectId={project.id} wpCode={item.wp.code} label={label} />}
                    {canAttach && <AttachEvidenceDialog projectId={project.id} entityId={item.id} wpCode={item.wp.code} />}
                  </>
                }
              >
                {samples.length > 0 && (
                  <ul className="list-unstyled small d-grid gap-2 wp-samples">
                    <li className="fw-semibold">{`ตัวอย่าง (${samples.length})`}</li>
                    {samples.map((name) => (
                      <li key={name}>
                        <a className="file-link" href={download(name)} title={name}>{name}</a>
                      </li>
                    ))}
                  </ul>
                )}
                {item.versions.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-dense table-sm align-middle">
                      <thead>
                        <tr>
                          <th scope="col">เวอร์ชัน</th>
                          <th scope="col">ไฟล์</th>
                          <th scope="col">หมายเหตุ</th>
                          <th scope="col">ผู้อัปโหลด</th>
                          <th scope="col">วันที่</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...item.versions].reverse().map((v) => (
                          <tr key={v.version}>
                            <td className="fw-semibold">{v.version}</td>
                            <td>
                              <a className="file-link" href={`/api/files/${v.attachmentId}`} title={v.fileName}>{v.fileName}</a>
                            </td>
                            <td>{v.note ?? ""}</td>
                            <td className="text-nowrap">{v.uploadedBy}</td>
                            <td className="text-nowrap">{formatThaiDate(v.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {item.attachments.length > 0 && (
                  <ul className="list-unstyled small mb-0 d-grid gap-2 wp-attachments">
                    {item.attachments.map((a) => (
                      <li key={a.id} className="d-flex flex-wrap align-items-center gap-2">
                        <StatusChip variant={KIND_VARIANT[a.kind]}>{ATTACHMENT_KIND_LABEL[a.kind]}</StatusChip>
                        <a className="file-link" href={`/api/files/${a.id}`} title={a.fileName}>{a.fileName}</a>
                        <span className="text-body-secondary">{a.uploadedBy} · {formatThaiDate(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </WpRow>
            );
          })}
        </PhaseItem>
      ))}
    </PhaseAccordion>
  );
}
