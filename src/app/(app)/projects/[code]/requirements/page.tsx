import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { REQUIREMENT_TYPE_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listAgreementItems, listRequirements } from "@/features/trace/service";
import { deleteAgreementItemAction, deleteRequirementAction } from "@/features/trace/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { RequirementStatusBadge } from "@/components/status-badge";
import { AgreementItemDialog, RequirementDialog } from "./trace-dialogs";

export default async function RequirementsPage({ params }: PageProps<"/projects/[code]/requirements">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const manage = can(await getActor(user, project.id), "trace.manage");
  const [agreements, requirements] = await Promise.all([
    listAgreementItems(user, project.id),
    listRequirements(user, project.id),
  ]);
  const agreementOptions = agreements.map((a) => ({ id: a.id, label: `${a.code} ${a.text}` }));
  const base = `/projects/${project.code}`;

  return (
    <div className="d-grid gap-4">
      <AppCard
        title="ขอบเขตตาม Agreement"
        icon="handshake"
        actions={manage && <AgreementItemDialog projectId={project.id} />}
      >
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">รหัส</th>
                <th scope="col">รายละเอียด</th>
                {manage && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {agreements.length === 0 && (
                <tr><td colSpan={manage ? 3 : 2} className="text-center text-body-secondary py-4">ยังไม่มีขอบเขต</td></tr>
              )}
              {agreements.map((a) => (
                <tr key={a.id}>
                  <td className="fw-medium text-nowrap">{a.code}</td>
                  <td className="text-pre-wrap">{a.text}</td>
                  {manage && (
                    <td className="text-end table-actions">
                      <AgreementItemDialog projectId={project.id} item={a} />
                      <DeleteButton confirmText={`ลบ ${a.code}?`} action={deleteAgreementItemAction.bind(null, a.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard
        title="Requirement"
        icon="checklist"
        actions={manage && <RequirementDialog projectId={project.id} agreements={agreementOptions} />}
      >
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">รหัส</th>
                <th scope="col" className="d-none d-md-table-cell">ประเภท</th>
                <th scope="col">รายละเอียด</th>
                <th scope="col" className="d-none d-md-table-cell">ลำดับความสำคัญ</th>
                <th scope="col" className="d-none d-md-table-cell">AG</th>
                <th scope="col">สถานะ</th>
                {manage && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {requirements.length === 0 && (
                <tr><td colSpan={manage ? 7 : 6} className="text-center text-body-secondary py-4">ยังไม่มี Requirement</td></tr>
              )}
              {requirements.map((r) => (
                <tr key={r.id}>
                  <td className="fw-medium text-nowrap"><Link href={`${base}/requirements/${r.code}`}>{r.code}</Link></td>
                  <td className="d-none d-md-table-cell text-nowrap">{REQUIREMENT_TYPE_LABEL[r.type]}</td>
                  <td className="text-pre-wrap">{r.text}</td>
                  <td className="d-none d-md-table-cell">{r.priority ?? "-"}</td>
                  <td className="d-none d-md-table-cell text-nowrap">{r.agreement?.code ?? "-"}</td>
                  <td><RequirementStatusBadge status={r.status} /></td>
                  {manage && (
                    <td className="text-end table-actions">
                      <DeleteButton confirmText={`ลบ ${r.code}?`} action={deleteRequirementAction.bind(null, r.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>
    </div>
  );
}
