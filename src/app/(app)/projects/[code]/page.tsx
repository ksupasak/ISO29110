import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { ROLE_ORDER, formatBaht } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listAssignableUsers, listMembers } from "@/features/members/service";
import { AppCard } from "@/components/app-card";
import { ProjectStatusBadge, RoleBadge } from "@/components/status-badge";
import { EditProjectDialog } from "./edit-project-dialog";
import { AddMemberDialog, EditMemberDialog, RemoveMemberButton } from "./team-dialogs";

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const actor = await getActor(user, project.id);
  const canEdit = can(actor, "project.edit");
  const canManage = can(actor, "member.manage");
  const showRate = can(actor, "member.viewRate");
  const [members, assignable] = await Promise.all([
    listMembers(user, project.id),
    canManage ? listAssignableUsers(user, project.id) : Promise.resolve([]),
  ]);

  const facts: [string, React.ReactNode][] = [
    ["รหัสโครงการ", project.code],
    ["ชื่อโครงการ", project.name],
    ["ชื่อย่อ", project.shortName || "-"],
    ["ลูกค้า", project.customerName || "-"],
    ["ประเภท", project.type],
    ["สถานะ", <ProjectStatusBadge key="s" status={project.status} />],
    ["วันเริ่ม", formatThaiDate(project.startDate) || "-"],
    ["วันสิ้นสุด", formatThaiDate(project.endDate) || "-"],
    ["งบประมาณ", project.budget != null ? formatBaht(project.budget.toFixed(2)) : "-"],
  ];

  return (
    <div className="d-grid gap-4">
      <AppCard
        title="ข้อมูลโครงการ"
        icon="info"
        actions={
          canEdit && (
            <EditProjectDialog
              project={{
                id: project.id,
                name: project.name,
                shortName: project.shortName ?? "",
                customerName: project.customerName ?? "",
                status: project.status,
                startDate: isoDate(project.startDate),
                endDate: isoDate(project.endDate),
                budget: project.budget != null ? project.budget.toFixed(2) : "",
                description: project.description ?? "",
              }}
            />
          )
        }
      >
        <dl className="card-body row g-3 mb-0">
          {facts.map(([label, value]) => (
            <div key={label} className="col-sm-6">
              <dt className="small fw-medium text-body-secondary">{label}</dt>
              <dd className="mb-0">{value}</dd>
            </div>
          ))}
          <div className="col-12">
            <dt className="small fw-medium text-body-secondary">รายละเอียด</dt>
            <dd className="mb-0">
              {project.description ? <span className="text-pre-wrap">{project.description}</span> : "-"}
            </dd>
          </div>
        </dl>
      </AppCard>

      <AppCard
        title="ทีมงาน"
        icon="groups"
        actions={canManage && <AddMemberDialog projectId={project.id} users={assignable} />}
      >
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">ชื่อ-สกุล</th>
                <th scope="col" className="d-none d-md-table-cell">ตำแหน่ง</th>
                <th scope="col">บทบาท</th>
                {showRate && <th scope="col" className="text-end d-none d-md-table-cell">อัตรา/วัน</th>}
                {canManage && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="fw-medium text-nowrap">{m.fullName}</td>
                  <td className="d-none d-md-table-cell">{m.position ?? "-"}</td>
                  <td>
                    <span className="d-flex flex-wrap gap-1">
                      {ROLE_ORDER.filter((r) => m.roles.includes(r)).map((r) => (
                        <RoleBadge key={r} role={r} primary={r === m.primaryRole} />
                      ))}
                    </span>
                  </td>
                  {showRate && <td className="text-end text-nowrap d-none d-md-table-cell">{m.dailyRate ? formatBaht(m.dailyRate) : "-"}</td>}
                  {canManage && (
                    <td className="text-end table-actions">
                      <EditMemberDialog member={m} />
                      <RemoveMemberButton member={m} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-footer small text-body-secondary mb-0">* บทบาทหลัก</p>
      </AppCard>
    </div>
  );
}
