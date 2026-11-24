import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProjectByCode } from "@/features/projects/service";
import { buildTraceMatrix, type Gap, type Ref } from "@/features/trace/matrix";
import { AppCard } from "@/components/app-card";
import { StatusChip } from "@/components/status-badge";

const GAP_LABEL: Record<Gap, string> = {
  REQ_NO_AG: "ไม่ได้โยง AG",
  REQ_NO_TASK: "ยังไม่มี Task",
  REQ_NO_COMPONENT: "ยังไม่มี Component",
  AG_NO_REQ: "ยังไม่มี Requirement",
  DEV_TASK_NO_REQ: "ยังไม่โยง Requirement",
};

const Warning = ({ gap }: { gap: Gap }) => <StatusChip variant="warning">{GAP_LABEL[gap]}</StatusChip>;

function Codes({ refs, href }: { refs: Ref[]; href: (code: string) => string }) {
  return (
    <span className="d-flex flex-wrap gap-2">
      {refs.map((r) => (
        <Link key={r.id} href={href(r.code)} title={r.title} className="fw-medium text-nowrap">{r.code}</Link>
      ))}
    </span>
  );
}

export default async function TracePage({ params }: PageProps<"/projects/[code]/trace">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const { rows, orphanDevTasks } = await buildTraceMatrix(user, project.id);
  const base = `/projects/${project.code}`;
  const reqHref = (c: string) => `${base}/requirements/${c}`;

  return (
    <div className="d-grid gap-4">
      <AppCard title="การอ้างอิง Agreement → Requirement → Task → Component" icon="hub">
        <div className="table-responsive">
          <table className="table table-hover align-top">
            <thead>
              <tr>
                <th scope="col">AG</th>
                <th scope="col">Requirement</th>
                <th scope="col">Task</th>
                <th scope="col">Component</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="text-center text-body-secondary py-4">ยังไม่มีข้อมูลการอ้างอิง</td></tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.requirement?.id ?? row.ag?.id ?? i}>
                  <td>
                    {row.ag ? <Codes refs={[row.ag]} href={() => `${base}/requirements`} /> : row.gaps.includes("REQ_NO_AG") && <Warning gap="REQ_NO_AG" />}
                  </td>
                  <td>
                    {row.requirement ? <Codes refs={[row.requirement]} href={reqHref} /> : <Warning gap="AG_NO_REQ" />}
                  </td>
                  <td>
                    {row.requirement &&
                      (row.gaps.includes("REQ_NO_TASK") ? <Warning gap="REQ_NO_TASK" /> : <Codes refs={row.tasks} href={(c) => `${base}/plan/${c}`} />)}
                  </td>
                  <td>
                    {row.requirement &&
                      (row.gaps.includes("REQ_NO_COMPONENT") ? <Warning gap="REQ_NO_COMPONENT" /> : <Codes refs={row.components} href={(c) => `${base}/components/${c}`} />)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard title="Task พัฒนาที่ยังไม่โยง Requirement" icon="warning">
        <div className="card-body">
          {orphanDevTasks.length === 0 ? (
            <p className="text-body-secondary mb-0">ไม่มี Task ที่ขาดการโยง</p>
          ) : (
            <ul className="list-unstyled mb-0 d-grid gap-1">
              {orphanDevTasks.map((t) => (
                <li key={t.id}>
                  <Link href={`${base}/plan/${t.code}`} className="fw-medium me-2">{t.code}</Link>
                  <span>{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AppCard>
    </div>
  );
}
