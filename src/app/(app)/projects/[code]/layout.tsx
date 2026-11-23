import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProjectByCode } from "@/features/projects/service";
import { PageHeader } from "@/components/page-header";
import { ProjectStatusBadge } from "@/components/status-badge";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  return (
    <>
      <PageHeader title={`${project.code} — ${project.name}`}>
        <ProjectStatusBadge status={project.status} />
      </PageHeader>
      {children}
    </>
  );
}
