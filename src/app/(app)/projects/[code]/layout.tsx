import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { getProjectByCode } from "@/features/projects/service";
import { TabLink } from "./tab-link";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  const base = `/projects/${project.code}`;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{project.code}</p>
        <h1 className="text-xl font-semibold">{project.name}</h1>
      </div>
      <nav className="flex gap-1 border-b text-sm">
        <TabLink href={base} exact>ภาพรวม</TabLink>
        <TabLink href={`${base}/documents`}>เอกสาร</TabLink>
      </nav>
      {children}
    </div>
  );
}
