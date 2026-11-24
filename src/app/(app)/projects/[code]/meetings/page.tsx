import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { getProjectByCode } from "@/features/projects/service";
import { listMeetings } from "@/features/meetings/service";
import { AppCard } from "@/components/app-card";
import { MeetingStatusBadge } from "@/components/status-badge";
import { CreateMeetingDialog } from "./meeting-dialogs";

export default async function MeetingsPage({ params }: PageProps<"/projects/[code]/meetings">) {
  const user = await requireUser();
  const { code } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();

  const canManage = can(await getActor(user, project.id), "meeting.manage");
  const meetings = await listMeetings(user, project.id);
  const base = `/projects/${project.code}/meetings`;

  return (
    <AppCard
      title="การประชุม"
      icon="groups"
      actions={
        canManage && (
          <CreateMeetingDialog
            projectId={project.id}
            projectCode={project.code}
            meetings={meetings.map((m) => ({ id: m.id, label: `${m.code} ${m.topic} (${formatThaiDate(m.meetingDate)})` }))}
          />
        )
      }
    >
      <div className="table-responsive">
        <table className="table table-hover align-middle">
          <thead>
            <tr>
              <th scope="col">เลขที่</th>
              <th scope="col" className="text-nowrap">วันที่</th>
              <th scope="col">หัวข้อ</th>
              <th scope="col">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {meetings.length === 0 && (
              <tr><td colSpan={4} className="text-center text-body-secondary py-4">ยังไม่มีการประชุม</td></tr>
            )}
            {meetings.map((m) => (
              <tr key={m.id}>
                <td className="fw-medium text-nowrap">
                  <Link href={`${base}/${m.code}`}>{m.code}</Link>
                </td>
                <td className="text-nowrap">{formatThaiDate(m.meetingDate)}</td>
                <td>{m.topic}</td>
                <td><MeetingStatusBadge status={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppCard>
  );
}
