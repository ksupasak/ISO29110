import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { REQUIREMENT_TYPE_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { getRequirement, listAgreementItems, listComponents } from "@/features/trace/service";
import { setRequirementComponentsAction, deleteRequirementAction } from "@/features/trace/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { LinkDialog } from "@/components/link-dialog";
import { ReferencePanel } from "@/components/reference-panel";
import { RequirementStatusBadge } from "@/components/status-badge";
import { RequirementDialog, RequirementStatusDialog } from "../trace-dialogs";

export default async function RequirementDetailPage({ params }: PageProps<"/projects/[code]/requirements/[reqCode]">) {
  const user = await requireUser();
  const { code, reqCode } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  const req = await getRequirement(user, project.id, decodeURIComponent(reqCode));
  if (!req) notFound();

  const actor = await getActor(user, project.id);
  const manage = can(actor, "trace.manage");
  const approve = can(actor, "requirement.approve");
  const base = `/projects/${project.code}`;
  const [agreements, components] = manage
    ? await Promise.all([listAgreementItems(user, project.id), listComponents(user, project.id)])
    : [[], []];

  const facts: [string, React.ReactNode][] = [
    ["รหัส", req.code],
    ["ประเภท", REQUIREMENT_TYPE_LABEL[req.type]],
    ["สถานะ", <RequirementStatusBadge key="s" status={req.status} />],
    ["ลำดับความสำคัญ", req.priority ?? "-"],
    ["ขอบเขตตาม Agreement", req.agreementItem ? `${req.agreementItem.code} ${req.agreementItem.text}` : "-"],
    ["อ้างอิงการออกแบบ", req.designRef ?? "-"],
  ];

  return (
    <div className="d-grid gap-4">
      <AppCard
        title={req.code}
        icon="checklist"
        actions={
          <>
            {(approve || (manage && req.status !== "APPROVED")) && (
              <RequirementStatusDialog id={req.id} status={req.status} canApprove={approve} />
            )}
            {manage && (
              <>
                <RequirementDialog
                  projectId={project.id}
                  agreements={agreements.map((a) => ({ id: a.id, label: `${a.code} ${a.text}` }))}
                  requirement={{
                    id: req.id,
                    code: req.code,
                    status: req.status,
                    text: req.text,
                    priority: req.priority ?? "",
                    agreementItemId: req.agreementItemId ?? "",
                    designRef: req.designRef ?? "",
                  }}
                />
                <DeleteButton
                  confirmText={`ลบ ${req.code}?`}
                  action={deleteRequirementAction.bind(null, req.id)}
                  redirectTo={`${base}/requirements`}
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
            <dt className="small fw-medium text-body-secondary">รายละเอียด</dt>
            <dd className="mb-0 text-pre-wrap">{req.text}</dd>
          </div>
        </dl>
      </AppCard>

      <ReferencePanel
        title="การอ้างอิง"
        actions={
          manage && (
            <LinkDialog
              action={setRequirementComponentsAction}
              hidden={{ id: req.id }}
              groups={[
                {
                  name: "componentIds",
                  legend: "Component ที่โยงโดยตรง",
                  options: components.map((c) => ({ id: c.id, label: `${c.code} ${c.name}` })),
                  selected: req.directComponentIds,
                },
              ]}
            />
          )
        }
        groups={[
          {
            label: "Agreement",
            items: req.agreementItem
              ? [{ code: req.agreementItem.code, text: req.agreementItem.text, href: `${base}/requirements` }]
              : [],
          },
          { label: "Task", items: req.tasks.map((t) => ({ code: t.code, text: t.title, href: `${base}/plan/${t.code}` })) },
          { label: "Component", items: req.components.map((c) => ({ code: c.code, text: c.name, href: `${base}/components/${c.code}` })) },
        ]}
      />
    </div>
  );
}
