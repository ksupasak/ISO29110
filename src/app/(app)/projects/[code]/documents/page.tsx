import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { ATTACHMENT_KIND_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listDocuments } from "@/features/documents/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttachEvidenceDialog, StatusSelect, UploadVersionDialog } from "./doc-controls";

const pad = (n: number) => String(n).padStart(2, "0");

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

  return (
    <div className="space-y-6">
      {phases.map(({ phase, items }) => (
        <Card key={phase.no}>
          <CardHeader>
            <CardTitle data-testid="phase-heading">{`${pad(phase.no)} ${phase.folder} (${phase.process})`}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {items.map((item) => {
              const label = `${pad(item.wp.seq)} · ${item.wp.code} ${item.wp.name}`;
              const options = ["Draft", ...item.wp.states].filter((s) => s !== "Baselined" || canBaseline || item.status === "Baselined");
              return (
                <div key={item.id} data-testid="wp-row" className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{label}</span>
                    <Badge variant="secondary">{item.status}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {item.currentVersion ? `เวอร์ชันปัจจุบัน ${item.currentVersion}` : "ยังไม่มีไฟล์"}
                    </span>
                    {item.wp.generated && <Badge variant="outline">ระบบสร้างให้</Badge>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {canSetStatus && (
                        <StatusSelect projectId={project.id} wpCode={item.wp.code} status={item.status} options={options} />
                      )}
                      {canUpload && <UploadVersionDialog projectId={project.id} wpCode={item.wp.code} label={label} />}
                      {canAttach && <AttachEvidenceDialog projectId={project.id} entityId={item.id} wpCode={item.wp.code} />}
                    </span>
                  </div>
                  {item.versions.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">ประวัติเวอร์ชัน ({item.versions.length})</summary>
                      <ul className="mt-1 space-y-1">
                        {[...item.versions].reverse().map((v) => (
                          <li key={v.version}>
                            <span className="font-medium">{v.version}</span>{" "}
                            <a className="underline" href={`/api/files/${v.attachmentId}`}>{v.fileName}</a>
                            {v.note && <> · {v.note}</>} · {v.uploadedBy} · {formatThaiDate(v.createdAt)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {item.attachments.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {item.attachments.map((a) => (
                        <li key={a.id}>
                          <Badge variant="outline">{ATTACHMENT_KIND_LABEL[a.kind]}</Badge>{" "}
                          <a className="underline" href={`/api/files/${a.id}`}>{a.fileName}</a> · {a.uploadedBy} · {formatThaiDate(a.createdAt)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
