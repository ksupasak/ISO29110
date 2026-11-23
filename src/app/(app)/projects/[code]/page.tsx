import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { ROLE_LABEL, ROLE_ORDER, STATUS_LABEL, formatBaht } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listAssignableUsers, listMembers } from "@/features/members/service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditProjectDialog } from "./edit-project-dialog";
import { AddMemberDialog, EditMemberDialog, RemoveMemberButton } from "./team-dialogs";

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[code]">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const actor = await getActor(user, project.id);
  const canEdit = can(actor, "project.edit");
  const canManage = can(actor, "member.manage");
  const showRate = can(actor, "member.viewRate");
  const [members, assignable] = await Promise.all([
    listMembers(user, project.id),
    canManage ? listAssignableUsers(user, project.id) : Promise.resolve([]),
  ]);

  const facts: [string, React.ReactNode][] = [
    ["รหัสโครงการ", project.code],
    ["ชื่อโครงการ", project.name],
    ["ชื่อย่อ", project.shortName || "-"],
    ["ลูกค้า", project.customerName || "-"],
    ["ประเภท", project.type],
    ["สถานะ", <Badge key="s" variant="secondary">{STATUS_LABEL[project.status]}</Badge>],
    ["วันเริ่ม", formatThaiDate(project.startDate) || "-"],
    ["วันสิ้นสุด", formatThaiDate(project.endDate) || "-"],
    ["งบประมาณ", project.budget != null ? formatBaht(project.budget.toFixed(2)) : "-"],
    ["รายละเอียด", project.description ? <span key="d" className="whitespace-pre-wrap">{project.description}</span> : "-"],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>ข้อมูลโครงการ</CardTitle>
          {canEdit && (
            <EditProjectDialog
              project={{
                id: project.id,
                name: project.name,
                shortName: project.shortName ?? "",
                customerName: project.customerName ?? "",
                status: project.status,
                startDate: isoDate(project.startDate),
                endDate: isoDate(project.endDate),
                budget: project.budget != null ? project.budget.toFixed(2) : "",
                description: project.description ?? "",
              }}
            />
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>ทีมงาน</CardTitle>
          {canManage && <AddMemberDialog projectId={project.id} users={assignable} />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อ-สกุล</TableHead>
                <TableHead>ตำแหน่ง</TableHead>
                <TableHead>บทบาท</TableHead>
                {showRate && <TableHead className="text-right">อัตรา/วัน</TableHead>}
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.fullName}</TableCell>
                  <TableCell>{m.position ?? "-"}</TableCell>
                  <TableCell>
                    {ROLE_ORDER.filter((r) => m.roles.includes(r)).map((r) => ROLE_LABEL[r] + (r === m.primaryRole ? " *" : "")).join(", ")}
                  </TableCell>
                  {showRate && <TableCell className="text-right">{m.dailyRate ? formatBaht(m.dailyRate) : "-"}</TableCell>}
                  {canManage && (
                    <TableCell className="space-x-2 text-right">
                      <EditMemberDialog member={m} />
                      <RemoveMemberButton member={m} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">* บทบาทหลัก</p>
        </CardContent>
      </Card>
    </div>
  );
}
