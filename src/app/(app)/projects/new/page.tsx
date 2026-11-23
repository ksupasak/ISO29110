import { requireAdmin } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, fullName: true, username: true },
    orderBy: { fullName: "asc" },
  });
  return (
    <>
      <PageHeader title="สร้างโครงการ" />
      <div className="row">
        <div className="col-12 col-xl-9 col-xxl-7">
          <NewProjectForm users={users} />
        </div>
      </div>
    </>
  );
}
