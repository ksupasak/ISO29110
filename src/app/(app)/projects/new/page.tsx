import { requireAdmin } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, fullName: true, username: true },
    orderBy: { fullName: "asc" },
  });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">สร้างโครงการ</h1>
      <NewProjectForm users={users} />
    </div>
  );
}
