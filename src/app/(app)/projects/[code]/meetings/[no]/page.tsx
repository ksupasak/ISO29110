import Link from "next/link";
import { notFound } from "next/navigation";
import type { MeetingItemKind } from "@prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { can, getActor } from "@/lib/authz";
import { formatThaiDate } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/labels";
import { getProjectByCode } from "@/features/projects/service";
import { listMembers } from "@/features/members/service";
import { listPlan } from "@/features/plan/service";
import { getMeeting, listMeetings, type MeetingItemView } from "@/features/meetings/service";
import {
  approveMeetingAction,
  deleteMeetingAction,
  removeAttendeeAction,
  removeItemAction,
  revertMeetingAction,
} from "@/features/meetings/actions";
import { AppCard } from "@/components/app-card";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icon";
import { MeetingStatusBadge, OpenIssueStatusBadge, StatusChip } from "@/components/status-badge";
import {
  AttendeeDialog,
  CreateTaskFromIssueDialog,
  ItemDialog,
  LinkTaskDialog,
  MeetingAttachmentDialog,
  MeetingFieldsDialog,
  MeetingStatusButton,
  type MemberOption,
} from "../meeting-dialogs";
import { MEETING_ATTACHMENT_KIND_LABEL, isoDate, itemFormValue, meetingHeaderValue, timeRange } from "../form-values";

const KIND_VARIANT = { SIGNED: "success", EVIDENCE: "info", OTHER: "secondary" } as const;

function Facts({ facts }: { facts: [string, React.ReactNode][] }) {
  return (
    <dl className="card-body row g-3 mb-0">
      {facts.map(([label, value]) => (
        <div key={label} className="col-sm-6">
          <dt className="small fw-medium text-body-secondary">{label}</dt>
          <dd className="mb-0 text-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Empty = ({ children = "ไม่มี" }: { children?: React.ReactNode }) => <p className="card-body small text-body-secondary mb-0">{children}</p>;

export default async function MeetingDetailPage({ params }: PageProps<"/projects/[code]/meetings/[no]">) {
  const user = await requireUser();
  const { code, no } = await params;
  const project = await getProjectByCode(user, code);
  if (!project) notFound();
  const meeting = await getMeeting(user, project.id, decodeURIComponent(no));
  if (!meeting) notFound();

  const actor = await getActor(user, project.id);
  const canManage = can(actor, "meeting.manage");
  const canApprove = can(actor, "meeting.approve");
  const canAttach = can(actor, "attachment.add");
  const draft = meeting.status === "DRAFT";
  const editable = canManage && draft;
  const base = `/projects/${project.code}`;

  const [members, plan, meetings] = editable
    ? await Promise.all([listMembers(user, project.id), listPlan(user, project.id), listMeetings(user, project.id)])
    : [[], { milestones: [], tasks: [] }, []];
  const memberOptions: MemberOption[] = members.map((m) => ({
    userId: m.userId,
    fullName: m.fullName,
    position: m.position ?? "",
    roleLabel: ROLE_LABEL[m.primaryRole],
  }));
  const ownerOptions = members.map((m) => ({ id: m.userId, label: m.fullName }));
  const assigneeOptions = members.filter((m) => m.roles.some((r) => r !== "VIEWER")).map((m) => ({ id: m.userId, label: m.fullName }));
  const taskOptions = plan.tasks.map((t) => ({ id: t.id, label: `${t.code} ${t.title}` }));
  const people = members.map((m) => `${m.fullName} (${m.position ?? ROLE_LABEL[m.primaryRole]})`);
  const previousOptions = meetings.filter((m) => m.id !== meeting.id).map((m) => ({ id: m.id, label: `${m.code} ${m.topic}` }));
  const header = meetingHeaderValue(meeting);

  const itemsOf = (kind: MeetingItemKind) => meeting.items.filter((i) => i.kind === kind);
  const when = `${formatThaiDate(meeting.meetingDate)} ${timeRange(meeting.startTime, meeting.endTime)}`.replace(/ -$/, "");

  const textList = (no: number, title: string, kind: Exclude<MeetingItemKind, "OPEN_ISSUE">) => {
    const items = itemsOf(kind);
    return (
      <AppCard title={`${no} ${title}`} icon="list" actions={editable && <ItemDialog meetingId={meeting.id} kind={kind} />}>
        {items.length === 0 ? (
          <Empty />
        ) : (
          <ul className="list-group list-group-flush">
            {items.map((i) => (
              <li key={i.id} className="list-group-item d-flex align-items-start gap-2">
                <span className="flex-grow-1 text-pre-wrap">{i.text}</span>
                {editable && (
                  <span className="table-actions text-nowrap">
                    <ItemDialog meetingId={meeting.id} kind={kind} item={itemFormValue(i)} />
                    <DeleteButton confirmText={`ลบ "${i.text}"?`} action={removeItemAction.bind(null, i.id)} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    );
  };

  const issueOwnerAssignee = (i: MeetingItemView) => (i.ownerId && assigneeOptions.some((a) => a.id === i.ownerId) ? i.ownerId : "");
  const openIssues = itemsOf("OPEN_ISSUE");
  const present = meeting.attendees;

  return (
    <div className="d-grid gap-4">
      <AppCard
        title={`${meeting.code} ${meeting.topic}`}
        icon="groups"
        actions={
          <>
            <a className="btn btn-outline-primary btn-sm" href={`/api/meetings/${meeting.id}/export`}>
              <Icon name="download" />
              ส่งออก docx
            </a>
            {canApprove && draft && (
              <MeetingStatusButton
                label="อนุมัติ"
                icon="verified"
                confirmText={`อนุมัติ ${meeting.code}? หลังอนุมัติจะแก้ไขไม่ได้ และระบบเก็บไฟล์ฉบับอนุมัติไว้`}
                action={approveMeetingAction.bind(null, meeting.id)}
              />
            )}
            {canApprove && !draft && (
              <MeetingStatusButton
                label="กลับเป็น Draft"
                icon="undo"
                variant="outline-primary"
                confirmText={`เปลี่ยน ${meeting.code} กลับเป็น Draft? ไฟล์ฉบับอนุมัติจะถูกลบ`}
                action={revertMeetingAction.bind(null, meeting.id)}
              />
            )}
            {editable && <MeetingFieldsDialog group="header" meeting={header} people={people} />}
            {editable && (
              <DeleteButton
                confirmText={`ลบ ${meeting.code} ${meeting.topic}?`}
                action={deleteMeetingAction.bind(null, meeting.id)}
                redirectTo={`${base}/meetings`}
              />
            )}
          </>
        }
      >
        <Facts
          facts={[
            ["โครงการ", `${project.code} ${project.name}`],
            ["เลขที่", meeting.code],
            ["หัวข้อการประชุม", meeting.topic],
            ["วันที่ / เวลา", when],
            ["สถานที่", meeting.place ?? "-"],
            ["ผู้บันทึก", meeting.recorder ?? "-"],
            ["ผู้จัดประชุม", meeting.organizer ?? "-"],
            [
              "สถานะ",
              <span key="s" className="d-inline-flex flex-wrap align-items-center gap-2">
                <MeetingStatusBadge status={meeting.status} />
                {!draft && meeting.approvedAt && (
                  <span className="small text-body-secondary">
                    {meeting.approvedByName ?? "-"} · {formatThaiDate(meeting.approvedAt)}
                  </span>
                )}
              </span>,
            ],
          ]}
        />
      </AppCard>

      <AppCard title="1 วัตถุประสงค์" icon="flag" actions={editable && <MeetingFieldsDialog group="purpose" meeting={header} />}>
        {meeting.purpose ? <p className="card-body mb-0 text-pre-wrap">{meeting.purpose}</p> : <Empty>-</Empty>}
      </AppCard>

      <AppCard title="2 ผู้เข้าร่วม" icon="group" actions={editable && <AttendeeDialog meetingId={meeting.id} members={memberOptions} />}>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">ลำดับ</th>
                <th scope="col">ชื่อ-สกุล</th>
                <th scope="col" className="d-none d-md-table-cell">ตำแหน่ง</th>
                <th scope="col" className="d-none d-md-table-cell">หน่วยงาน</th>
                <th scope="col" className="d-none d-md-table-cell">บทบาทในโครงการ</th>
                <th scope="col">การเข้าร่วม</th>
                {editable && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {present.length === 0 && (
                <tr><td colSpan={editable ? 7 : 6} className="text-center text-body-secondary py-4">ยังไม่มีผู้เข้าร่วม</td></tr>
              )}
              {present.map((a, idx) => (
                <tr key={a.id}>
                  <td>{idx + 1}</td>
                  <td className="text-nowrap">{a.fullName}</td>
                  <td className="d-none d-md-table-cell">{a.position ?? "-"}</td>
                  <td className="d-none d-md-table-cell">{a.organization ?? "-"}</td>
                  <td className="d-none d-md-table-cell">{a.projectRole ?? "-"}</td>
                  <td>
                    <StatusChip variant={a.present ? "success" : "secondary"}>{a.present ? "เข้าร่วม" : "ไม่เข้าร่วม"}</StatusChip>
                  </td>
                  {editable && (
                    <td className="text-end table-actions">
                      <AttendeeDialog
                        meetingId={meeting.id}
                        members={memberOptions}
                        attendee={{
                          id: a.id,
                          userId: a.userId ?? "",
                          fullName: a.fullName,
                          position: a.position ?? "",
                          organization: a.organization ?? "",
                          projectRole: a.projectRole ?? "",
                          present: a.present,
                        }}
                      />
                      <DeleteButton confirmText={`ลบ ${a.fullName} ออกจากผู้เข้าร่วม?`} action={removeAttendeeAction.bind(null, a.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard title="3 วันที่ สถานที่" icon="event">
        <Facts facts={[["วันที่ / เวลา", when], ["สถานที่", meeting.place ?? "-"]]} />
      </AppCard>

      <AppCard
        title="4 การประชุมครั้งก่อน"
        icon="history"
        actions={editable && <MeetingFieldsDialog group="previous" meeting={header} previousOptions={previousOptions} />}
      >
        <Facts
          facts={[
            [
              "การประชุมครั้งก่อน",
              meeting.previous ? (
                <span key="p">
                  <Link href={`${base}/meetings/${meeting.previous.code}`} className="fw-medium me-2">{meeting.previous.code}</Link>
                  วันที่ {formatThaiDate(meeting.previous.meetingDate)}
                </span>
              ) : (
                "ไม่มี"
              ),
            ],
            ["หมายเหตุ", meeting.previousNote ?? "-"],
          ]}
        />
      </AppCard>

      {textList(5, "สิ่งที่ดำเนินการแล้วเสร็จ", "ACCOMPLISHED")}
      {textList(6, "ประเด็นที่เกี่ยวข้อง", "ISSUE")}

      <AppCard
        title="7 ประเด็นค้าง"
        icon="pending_actions"
        actions={editable && <ItemDialog meetingId={meeting.id} kind="OPEN_ISSUE" members={ownerOptions} />}
      >
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">ลำดับ</th>
                <th scope="col">ประเด็น</th>
                <th scope="col" className="d-none d-md-table-cell">ผู้รับผิดชอบ</th>
                <th scope="col" className="text-nowrap d-none d-md-table-cell">กำหนดชี้แจง</th>
                <th scope="col">สถานะ</th>
                <th scope="col">Task</th>
                {editable && <th scope="col" className="table-actions" />}
              </tr>
            </thead>
            <tbody>
              {openIssues.length === 0 && (
                <tr><td colSpan={editable ? 7 : 6} className="text-center text-body-secondary py-4">ไม่มีประเด็นค้าง</td></tr>
              )}
              {openIssues.map((i, idx) => (
                <tr key={i.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <span className="text-pre-wrap">{i.text}</span>
                    {i.carriedFrom && (
                      <div className="small text-body-secondary">
                        ยกมาจาก <Link href={`${base}/meetings/${i.carriedFrom.meetingCode}`}>{i.carriedFrom.meetingCode}</Link>
                      </div>
                    )}
                  </td>
                  <td className="d-none d-md-table-cell text-nowrap">{i.ownerName ?? "-"}</td>
                  <td className="d-none d-md-table-cell text-nowrap">{formatThaiDate(i.dueDate) || "-"}</td>
                  <td><OpenIssueStatusBadge status={i.effectiveStatus} /></td>
                  <td className="text-nowrap">
                    {i.task ? (
                      <Link href={`${base}/plan/${i.task.code}`} className="fw-medium" title={i.task.title}>{i.task.code}</Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  {editable && (
                    <td className="text-end table-actions">
                      <ItemDialog meetingId={meeting.id} kind="OPEN_ISSUE" item={itemFormValue(i)} members={ownerOptions} />
                      {!i.task && (
                        <CreateTaskFromIssueDialog
                          itemId={i.id}
                          title={i.text}
                          assigneeId={issueOwnerAssignee(i)}
                          plannedEnd={isoDate(i.dueDate)}
                          assignees={assigneeOptions}
                        />
                      )}
                      <LinkTaskDialog itemId={i.id} taskId={i.task?.id ?? ""} tasks={taskOptions} />
                      <DeleteButton confirmText={`ลบประเด็น "${i.text}"?`} action={removeItemAction.bind(null, i.id)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>

      {textList(8, "ข้อตกลง", "AGREEMENT")}

      <AppCard title="9 การประชุมครั้งต่อไป" icon="event_upcoming" actions={editable && <MeetingFieldsDialog group="next" meeting={header} />}>
        <Facts
          facts={[
            ["หัวข้อ", meeting.nextTopic ?? "-"],
            ["วันที่ / เวลา", meeting.nextDate || meeting.nextStartTime ? `${formatThaiDate(meeting.nextDate) || "-"} ${timeRange(meeting.nextStartTime, meeting.nextEndTime)}`.replace(/ -$/, "") : "-"],
            ["สถานที่", meeting.nextPlace ?? "-"],
          ]}
        />
      </AppCard>

      <AppCard
        title="ไฟล์แนบ"
        icon="attach_file"
        actions={canAttach && <MeetingAttachmentDialog projectId={project.id} meetingId={meeting.id} />}
      >
        {meeting.attachments.length === 0 ? (
          <Empty>ยังไม่มีไฟล์แนบ</Empty>
        ) : (
          <ul className="list-unstyled small card-body mb-0 d-grid gap-2">
            {meeting.attachments.map((a) => (
              <li key={a.id} className="d-flex flex-wrap align-items-center gap-2">
                <StatusChip variant={KIND_VARIANT[a.kind]}>{MEETING_ATTACHMENT_KIND_LABEL[a.kind]}</StatusChip>
                <a className="file-link" href={`/api/files/${a.id}`} title={a.fileName}>{a.fileName}</a>
                <span className="text-body-secondary">{a.uploadedBy} · {formatThaiDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </div>
  );
}
