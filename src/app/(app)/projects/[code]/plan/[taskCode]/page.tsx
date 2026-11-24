import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, canUpdateTaskProgress, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { TASK_KIND_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listMembers } from "@/features/members/service";
import { getTask, listPlan } from "@/features/plan/service";
import { deleteTaskAction } from "@/features/plan/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { ReferencePanel } from "@/components/reference-panel";
import { TaskStatusBadge } from "@/components/status-badge";
import { ProgressDialog, TaskDialog } from "../plan-dialogs";
import { taskFormValue } from "../form-values";

export default async function TaskDetailPage({ params }: PageProps<"/projects/[code]/plan/[taskCode]">) {
  const user = await requireUser();
  const { code, taskCode } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  const task = await getTask(user, project.id, decodeURIComponent(taskCode));
  if (!task) notFound();

  const actor = await getActor(user, project.id);
  const canManage = can(actor, "plan.manage");
  const canProgress = canUpdateTaskProgress(actor, task);
  const base = `/projects/${project.code}`;
  const [members, plan] = canManage
    ? await Promise.all([listMembers(user, project.id), listPlan(user, project.id)])
    : [[], { milestones: [], tasks: [] }];

  const days = (n: number | null) => (n === null ? "-" : `${n} วัน`);
  const facts: [string, React.ReactNode][] = [
    ["รหัส", task.code],
    ["WBS", task.wbsCode ?? "-"],
    ["ชื่องาน", task.title],
    ["ชนิด", TASK_KIND_LABEL[task.kind]],
    ["สถานะ", <TaskStatusBadge key="s" status={task.status} />],
    ["ความคืบหน้า", `${task.percent}%`],
    ["ผู้รับผิดชอบ", task.assigneeName ?? "-"],
    ["Milestone", task.milestone ? `${task.milestone.code} ${task.milestone.name}` : "-"],
    ["Task แม่", task.parent ? `${task.parent.code} ${task.parent.title}` : "-"],
    ["วันเริ่มตามแผน", formatThaiDate(task.plannedStart) || "-"],
    ["วันเสร็จตามแผน", formatThaiDate(task.plannedEnd) || "-"],
    ["จำนวนวันตามแผน", days(task.plannedDays)],
    ["วันเริ่มจริง", formatThaiDate(task.actualStart) || "-"],
    ["วันเสร็จจริง", formatThaiDate(task.actualEnd) || "-"],
    ["จำนวนวันจริง", days(task.actualDays)],
    ["กิจกรรม ISO", task.isoActivity ?? "-"],
    ["ชนิดการทดสอบ", task.qaType ?? "-"],
    ["ผลลัพธ์ (WP)", task.outputWp ?? "-"],
  ];

  return (
    <div className="d-grid gap-4">
      <AppCard
        title={`${task.code} ${task.title}`}
        icon="task_alt"
        actions={
          <>
            {canProgress && <ProgressDialog task={taskFormValue(task)} />}
            {canManage && (
              <>
                <TaskDialog
                  projectId={project.id}
                  task={taskFormValue(task)}
                  members={members.map((m) => ({ id: m.userId, label: m.fullName }))}
                  milestones={plan.milestones.map((m) => ({ id: m.id, label: `${m.code} ${m.name}` }))}
                  parents={plan.tasks.map((t) => ({ id: t.id, label: `${t.code} ${t.title}` }))}
                />
                <DeleteButton
                  confirmText={`ลบ ${task.code} ${task.title}?`}
                  action={deleteTaskAction.bind(null, task.id)}
                  redirectTo={`${base}/plan`}
                />
              </>
            )}
          </>
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
            <dt className="small fw-medium text-body-secondary">หมายเหตุ</dt>
            <dd className="mb-0">{task.note ? <span className="text-pre-wrap">{task.note}</span> : "-"}</dd>
          </div>
        </dl>
      </AppCard>

      <ReferencePanel
        title="การอ้างอิง"
        groups={[
          {
            label: "Requirement",
            items: task.requirements.map((r) => ({ code: r.code, text: r.text, href: `${base}/requirements/${r.code}` })),
          },
          {
            label: "Component",
            items: task.components.map((c) => ({ code: c.code, text: c.name, href: `${base}/components/${c.code}` })),
          },
          ...(task.children.length > 0
            ? [{ label: "Task ย่อย", items: task.children.map((c) => ({ code: c.code, text: c.title, href: `${base}/plan/${c.code}` })) }]
            : []),
        ]}
      />
    </div>
  );
}
