import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { formatThaiDate } from "@/lib/dates";
import { listVisibleProjects } from "@/features/projects/service";
import { listMyOpenTasks } from "@/features/plan/service";
import { AppCard } from "@/components/app-card";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ProjectStatusBadge, TaskStatusBadge } from "@/components/status-badge";

function SummaryCard({ icon, tone, label, value }: { icon: string; tone: "primary" | "success" | "muted"; label: string; value: number }) {
  return (
    <div className="col">
      <div className="card stat-card h-100">
        <span className={`stat-card-icon stat-card-icon-${tone}`}>
          <Icon name={icon} />
        </span>
        <div>
          <div className="stat-card-value">{value}</div>
          <div className="stat-card-label">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const [projects, myTasks] = await Promise.all([listVisibleProjects(user), listMyOpenTasks(user)]);
  const active = projects.filter((p) => p.status === "ACTIVE").length;
  const closed = projects.filter((p) => p.status === "CLOSED").length;
  return (
    <>
      <PageHeader title="โครงการ">
        {user.systemRole === "ADMIN" && (
          <Link href="/projects/new" className="btn btn-primary">
            <Icon name="add" />
            สร้างโครงการ
          </Link>
        )}
      </PageHeader>
      <div className="row row-cols-1 row-cols-sm-3 g-3 mb-4">
        <SummaryCard icon="folder_open" tone="primary" label="โครงการทั้งหมด" value={projects.length} />
        <SummaryCard icon="play_circle" tone="success" label="กำลังดำเนินการ" value={active} />
        <SummaryCard icon="task_alt" tone="muted" label="ปิดโครงการแล้ว" value={closed} />
      </div>
      {projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-body-secondary py-5">
            <Icon name="folder_off" className="d-block mx-auto mb-2 fs-1" />
            <p className="mb-0">ยังไม่มีโครงการ</p>
          </div>
        </div>
      ) : (
        <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
          {projects.map((p) => (
            <div key={p.id} className="col">
              <Link href={`/projects/${p.code}`} className="card link-card h-100">
                <div className="card-body d-flex flex-column gap-2">
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <span className="fw-semibold text-primary">{p.code}</span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <h2 className="h6 mb-0 link-card-title">{p.name}</h2>
                  {(p.startDate || p.endDate) && (
                    <p className="small text-body-secondary mb-0 mt-auto pt-2 d-flex align-items-center gap-1">
                      <Icon name="calendar_month" className="fs-6" />
                      {formatThaiDate(p.startDate)} - {formatThaiDate(p.endDate)}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        <AppCard title="งานของฉัน" icon="assignment_ind">
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th scope="col" className="d-none d-md-table-cell">รหัสโครงการ</th>
                  <th scope="col">รหัส Task</th>
                  <th scope="col">ชื่องาน</th>
                  <th scope="col" className="text-nowrap d-none d-md-table-cell">กำหนดเสร็จ</th>
                  <th scope="col">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-body-secondary py-4">ไม่มีงานค้าง</td></tr>
                )}
                {myTasks.map((t) => (
                  <tr key={`${t.projectCode}/${t.taskCode}`}>
                    <td className="d-none d-md-table-cell text-nowrap">
                      <Link href={`/projects/${t.projectCode}`}>{t.projectCode}</Link>
                    </td>
                    <td className="fw-medium text-nowrap">
                      <Link href={`/projects/${t.projectCode}/plan/${t.taskCode}`}>{t.taskCode}</Link>
                    </td>
                    <td>{t.title}</td>
                    <td className="d-none d-md-table-cell text-nowrap">{formatThaiDate(t.plannedEnd) || "-"}</td>
                    <td><TaskStatusBadge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppCard>
      </div>
    </>
  );
}
