import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { TASK_KIND_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listMembers } from "@/features/members/service";
import { TASK_KINDS, TASK_STATUSES, listPlan, type PlanFilter } from "@/features/plan/service";
import { deleteMilestoneAction, deleteTaskAction } from "@/features/plan/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icon";
import { TaskStatusBadge } from "@/components/status-badge";
import { MilestoneDialog, TaskDialog } from "./plan-dialogs";
import { milestoneFormValue } from "./form-values";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const range = (a: Date | null, b: Date | null) => (a || b ? `${formatThaiDate(a) || "-"} - ${formatThaiDate(b) || "-"}` : "-");

export default async function PlanPage({ params, searchParams }: PageProps<"/projects/[code]/plan">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const sp = await searchParams;
  const status = one(sp.status);
  const kind = one(sp.kind);
  const assignee = one(sp.assignee);
  const filter: PlanFilter = {
    ...(TASK_STATUSES.includes(status as never) ? { status: status as PlanFilter["status"] } : {}),
    ...(TASK_KINDS.includes(kind as never) ? { kind: kind as PlanFilter["kind"] } : {}),
    ...(assignee ? { assigneeId: assignee } : {}),
  };

  const canManage = can(await getActor(user, project.id), "plan.manage");
  const [all, members] = await Promise.all([listPlan(user, project.id), listMembers(user, project.id)]);
  const { milestones } = all;
  // The unfiltered list also feeds the dialogs, so filter the table rows in memory.
  const tasks = all.tasks.filter(
    (t) =>
      (!filter.status || t.status === filter.status) &&
      (!filter.assigneeId || t.assigneeId === filter.assigneeId) &&
      (!filter.kind || t.kind === filter.kind),
  );
  const memberOptions = members.map((m) => ({ id: m.userId, label: m.fullName }));
  const milestoneOptions = all.milestones.map((m) => ({ id: m.id, label: `${m.code} ${m.name}` }));
  const parentOptions = all.tasks.map((t) => ({ id: t.id, label: `${t.code} ${t.title}` }));
  const base = `/projects/${project.code}`;
  const filtered = Object.keys(filter).length > 0;

  return (
    <div className="d-grid gap-4">
      <AppCard
        title="Milestone"
        icon="flag"
        actions={canManage && <MilestoneDialog projectId={project.id} />}
      >
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">รหัส</th>
                <th scope="col">ชื่อ</th>
                <th scope="col" className="text-nowrap">วันตามแผน</th>
                <th scope="col" className="text-nowrap d-none d-md-table-cell">วันปรับแผน</th>
                <th scope="col" className="text-nowrap d-none d-md-table-cell">วันจริง</th>
                {canManage && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {milestones.length === 0 && (
                <tr><td colSpan={canManage ? 6 : 5} className="text-center text-body-secondary py-4">ยังไม่มี Milestone</td></tr>
              )}
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td className="fw-medium text-nowrap">{m.code}</td>
                  <td>{m.name}</td>
                  <td className="text-nowrap">{formatThaiDate(m.plannedDate) || "-"}</td>
                  <td className="text-nowrap d-none d-md-table-cell">{formatThaiDate(m.revisedDate) || "-"}</td>
                  <td className="text-nowrap d-none d-md-table-cell">{formatThaiDate(m.actualDate) || "-"}</td>
                  {canManage && (
                    <td className="text-end table-actions">
                      <MilestoneDialog projectId={project.id} milestone={milestoneFormValue(m)} />
                      <DeleteButton confirmText={`ลบ ${m.code} ${m.name}?`} action={deleteMilestoneAction.bind(null, m.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard
        title="Task"
        icon="account_tree"
        actions={
          canManage && (
            <TaskDialog projectId={project.id} members={memberOptions} milestones={milestoneOptions} parents={parentOptions} />
          )
        }
      >
        <form method="get" className="card-body border-bottom row g-2 align-items-end">
          <div className="col-6 col-md-3">
            <label htmlFor="f-status" className="form-label small text-body-secondary mb-1">สถานะ</label>
            <select id="f-status" name="status" className="form-select form-select-sm" defaultValue={filter.status ?? ""}>
              <option value="">ทั้งหมด</option>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="f-assignee" className="form-label small text-body-secondary mb-1">ผู้รับผิดชอบ</label>
            <select id="f-assignee" name="assignee" className="form-select form-select-sm" defaultValue={filter.assigneeId ?? ""}>
              <option value="">ทั้งหมด</option>
              {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="f-kind" className="form-label small text-body-secondary mb-1">ชนิด</label>
            <select id="f-kind" name="kind" className="form-select form-select-sm" defaultValue={filter.kind ?? ""}>
              <option value="">ทั้งหมด</option>
              {TASK_KINDS.map((k) => <option key={k} value={k}>{TASK_KIND_LABEL[k]}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-3 d-flex gap-2">
            <button type="submit" className="btn btn-outline-primary btn-sm">กรอง</button>
            {filtered && <Link href={`${base}/plan`} className="btn btn-link btn-sm">ล้างตัวกรอง</Link>}
          </div>
        </form>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">รหัส</th>
                <th scope="col" className="d-none d-md-table-cell">WBS</th>
                <th scope="col">ชื่องาน</th>
                <th scope="col" className="d-none d-md-table-cell">ชนิด</th>
                <th scope="col" className="d-none d-md-table-cell">ผู้รับผิดชอบ</th>
                <th scope="col" className="text-nowrap d-none d-md-table-cell">แผน</th>
                <th scope="col">สถานะ</th>
                <th scope="col" className="text-end">%</th>
                <th scope="col" className="table-actions" />
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr><td colSpan={9} className="text-center text-body-secondary py-4">{filtered ? "ไม่พบ Task ตามตัวกรอง" : "ยังไม่มี Task"}</td></tr>
              )}
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="fw-medium text-nowrap">
                    <Link href={`${base}/plan/${t.code}`}>{t.code}</Link>
                  </td>
                  <td className="d-none d-md-table-cell text-nowrap">{t.wbsCode ?? "-"}</td>
                  <td style={{ paddingLeft: `${0.5 + t.depth * 1.25}rem` }}>{t.title}</td>
                  <td className="d-none d-md-table-cell">{TASK_KIND_LABEL[t.kind]}</td>
                  <td className="d-none d-md-table-cell text-nowrap">{t.assigneeName ?? "-"}</td>
                  <td className="d-none d-md-table-cell text-nowrap">{range(t.plannedStart, t.plannedEnd)}</td>
                  <td><TaskStatusBadge status={t.status} /></td>
                  <td className="text-end">{t.percent}</td>
                  <td className="text-end table-actions">
                    <Link href={`${base}/plan/${t.code}`} className="btn btn-icon" aria-label="ดูรายละเอียด" title="ดูรายละเอียด">
                      <Icon name="visibility" />
                    </Link>
                    {canManage && (
                      <DeleteButton confirmText={`ลบ ${t.code} ${t.title}?`} action={deleteTaskAction.bind(null, t.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>
    </div>
  );
}
