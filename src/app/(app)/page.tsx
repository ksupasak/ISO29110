import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { formatThaiDate } from "@/lib/dates";
import { listVisibleProjects } from "@/features/projects/service";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "วางแผน",
  ACTIVE: "ดำเนินการ",
  CLOSED: "ปิดโครงการ",
};

export default async function HomePage() {
  const user = await requireUser();
  const projects = await listVisibleProjects(user);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">โครงการ</h1>
        {user.systemRole === "ADMIN" && (
          <Link href="/projects/new" className={buttonVariants()}>สร้างโครงการ</Link>
        )}
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีโครงการ</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{p.code}</span>
                  <Badge variant="secondary">{STATUS_LABEL[p.status]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{p.name}</p>
                {(p.startDate || p.endDate) && (
                  <p className="text-muted-foreground">
                    {formatThaiDate(p.startDate)} - {formatThaiDate(p.endDate)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
