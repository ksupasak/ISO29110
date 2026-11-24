import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { getProjectByCode } from "@/features/projects/service";
import { listMembers } from "@/features/members/service";
import { listComponents } from "@/features/trace/service";
import { deleteComponentAction } from "@/features/trace/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { UnitTestBadge } from "@/components/status-badge";
import { ComponentDialog } from "./component-dialogs";

export default async function ComponentsPage({ params }: PageProps<"/projects/[code]/components">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const manage = can(await getActor(user, project.id), "trace.manage");
  const [components, members] = await Promise.all([listComponents(user, project.id), listMembers(user, project.id)]);
  const memberOptions = members.map((m) => ({ id: m.userId, label: m.fullName }));
  const base = `/projects/${project.code}`;

  return (
    <AppCard
      title="Component"
      icon="widgets"
      actions={manage && <ComponentDialog projectId={project.id} members={memberOptions} />}
    >
      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr>
              <th scope="col">รหัส</th>
              <th scope="col">ชื่อ</th>
              <th scope="col" className="d-none d-md-table-cell">ผู้รับผิดชอบ</th>
              <th scope="col">สถานะการทดสอบ</th>
              <th scope="col" className="d-none d-md-table-cell">เวอร์ชัน</th>
              {manage && <th scope="col" className="table-actions" />}
            </tr>
          </thead>
          <tbody>
            {components.length === 0 && (
              <tr><td colSpan={manage ? 6 : 5} className="text-center text-body-secondary py-4">ยังไม่มี Component</td></tr>
            )}
            {components.map((c) => (
              <tr key={c.id}>
                <td className="fw-medium text-nowrap"><Link href={`${base}/components/${c.code}`}>{c.code}</Link></td>
                <td>{c.name}</td>
                <td className="d-none d-md-table-cell text-nowrap">{c.owner?.fullName ?? "-"}</td>
                <td><UnitTestBadge status={c.unitTestStatus} /></td>
                <td className="d-none d-md-table-cell">{c.version ?? "-"}</td>
                {manage && (
                  <td className="text-end table-actions">
                    <DeleteButton confirmText={`ลบ ${c.code} ${c.name}?`} action={deleteComponentAction.bind(null, c.id)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}
