import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { getProjectByCode } from "@/features/projects/service";
import { listMembers } from "@/features/members/service";
import { getComponent, listRequirements } from "@/features/trace/service";
import { listPlan } from "@/features/plan/service";
import { deleteComponentAction, setComponentLinksAction } from "@/features/trace/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { LinkDialog } from "@/components/link-dialog";
import { ReferencePanel } from "@/components/reference-panel";
import { UnitTestBadge } from "@/components/status-badge";
import { ComponentDialog } from "../component-dialogs";

export default async function ComponentDetailPage({ params }: PageProps<"/projects/[code]/components/[compCode]">) {
  const user = await requireUser();
  const { code, compCode } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  const comp = await getComponent(user, project.id, decodeURIComponent(compCode));
  if (!comp) notFound();

  const manage = can(await getActor(user, project.id), "trace.manage");
  const base = `/projects/${project.code}`;
  const [members, allRequirements, plan] = manage
    ? await Promise.all([listMembers(user, project.id), listRequirements(user, project.id), listPlan(user, project.id)])
    : [[], [], { milestones: [], tasks: [] }];

  const facts: [string, React.ReactNode][] = [
    ["รหัส", comp.code],
    ["ชื่อ", comp.name],
    ["ผู้รับผิดชอบ", comp.owner?.fullName ?? "-"],
    ["สถานะการทดสอบ", <UnitTestBadge key="u" status={comp.unitTestStatus} />],
    ["เวอร์ชัน", comp.version ?? "-"],
  ];

  return (
    <div className="d-grid gap-4">
      <AppCard
        title={`${comp.code} ${comp.name}`}
        icon="widgets"
        actions={
          manage && (
            <>
              <ComponentDialog
                projectId={project.id}
                members={members.map((m) => ({ id: m.userId, label: m.fullName }))}
                component={{
                  id: comp.id,
                  code: comp.code,
                  name: comp.name,
                  description: comp.description ?? "",
                  ownerId: comp.ownerId ?? "",
                  unitTestStatus: comp.unitTestStatus,
                  version: comp.version ?? "",
                }}
              />
              <DeleteButton
                confirmText={`ลบ ${comp.code} ${comp.name}?`}
                action={deleteComponentAction.bind(null, comp.id)}
                redirectTo={`${base}/components`}
              />
            </>
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
            <dd className="mb-0">{comp.description ? <span className="text-pre-wrap">{comp.description}</span> : "-"}</dd>
          </div>
        </dl>
      </AppCard>

      <ReferencePanel
        title="การอ้างอิง"
        actions={
          manage && (
            <LinkDialog
              action={setComponentLinksAction}
              hidden={{ id: comp.id }}
              groups={[
                {
                  name: "requirementIds",
                  legend: "Requirement ที่โยงโดยตรง",
                  options: allRequirements.map((r) => ({ id: r.id, label: `${r.code} ${r.text}` })),
                  selected: comp.directRequirementIds,
                },
                {
                  name: "taskIds",
                  legend: "Task",
                  options: plan.tasks.map((t) => ({ id: t.id, label: `${t.code} ${t.title}` })),
                  selected: comp.tasks.map((t) => t.id),
                },
              ]}
            />
          )
        }
        groups={[
          { label: "Requirement", items: comp.requirements.map((r) => ({ code: r.code, text: r.text, href: `${base}/requirements/${r.code}` })) },
          { label: "Task", items: comp.tasks.map((t) => ({ code: t.code, text: t.title, href: `${base}/plan/${t.code}` })) },
        ]}
      />
    </div>
  );
}
