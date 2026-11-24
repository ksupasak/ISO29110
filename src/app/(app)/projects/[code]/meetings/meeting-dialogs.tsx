"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "react-bootstrap/Button";
import {
  addAttendeeAction,
  addItemAction,
  addMeetingAttachmentAction,
  createMeetingAction,
  createTaskFromIssueAction,
  linkIssueToTaskAction,
  updateAttendeeAction,
  updateItemAction,
  updateMeetingAction,
} from "@/features/meetings/actions";
import { FormDialog } from "@/components/form-dialog";
import { FileField, FloatingField, FloatingSelect, FloatingTextarea } from "@/components/form-fields";
import { Icon } from "@/components/icon";
import { MEETING_ITEM_KIND_LABEL, OPEN_ISSUE_STATUS_LABEL } from "@/lib/labels";
import { FILE_TOO_LARGE_MESSAGE, MAX_FILE_BYTES } from "@/lib/upload-limits";
import { MEETING_ATTACHMENT_KIND_LABEL, type ItemFormValue, type MeetingHeaderValue } from "./form-values";

type State = { error?: string; ok?: boolean; values?: Record<string, string> };
type Option = { id: string; label: string };
export type MemberOption = { userId: string; fullName: string; position: string; roleLabel: string };

function Opt({ options, empty }: { options: Option[]; empty: string }) {
  return (
    <>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </>
  );
}

// ---------- meetings ----------

export function CreateMeetingDialog({ projectId, projectCode, meetings }: { projectId: string; projectCode: string; meetings: Option[] }) {
  const router = useRouter();
  const action = async (prev: State, fd: FormData): Promise<State> => {
    const r = await createMeetingAction(prev, fd);
    if (r.ok && r.values?.code) router.push(`/projects/${encodeURIComponent(projectCode)}/meetings/${encodeURIComponent(r.values.code)}`);
    return r;
  };
  return (
    <FormDialog title="สร้างการประชุม" trigger="สร้างการประชุม" triggerIcon="add" action={action} submitLabel="สร้าง">
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <FloatingField id="topic" label="หัวข้อ" required defaultValue={v.topic ?? ""} />
          <FloatingField id="meetingDate" label="วันที่" type="date" required defaultValue={v.meetingDate ?? ""} />
          <div>
            <FloatingSelect key={`prev-${v.previousId ?? ""}`} id="previousId" label="การประชุมครั้งก่อน" defaultValue={v.previousId ?? ""}>
              <Opt options={meetings} empty="ไม่มี" />
            </FloatingSelect>
            <div className="form-text">ประเด็นค้างที่ยังไม่ปิดจะถูกยกมา</div>
          </div>
        </>
      )}
    </FormDialog>
  );
}

type HeaderGroup = "header" | "purpose" | "previous" | "next";
const GROUP_TITLE: Record<HeaderGroup, string> = {
  header: "แก้ไขข้อมูลการประชุม",
  purpose: "แก้ไขวัตถุประสงค์",
  previous: "แก้ไขการประชุมครั้งก่อน",
  next: "แก้ไขการประชุมครั้งต่อไป",
};

/** Edits one group of header fields; only those are posted, so the rest of the header is left as stored. */
export function MeetingFieldsDialog({
  group,
  meeting,
  people = [],
  previousOptions = [],
}: {
  group: HeaderGroup;
  meeting: MeetingHeaderValue;
  /** "ชื่อ (ตำแหน่ง)" suggestions for recorder and organizer. */
  people?: string[];
  previousOptions?: Option[];
}) {
  return (
    <FormDialog title={GROUP_TITLE[group]} trigger={GROUP_TITLE[group]} triggerIcon="edit" iconOnly action={updateMeetingAction}>
      {(v) => {
        const val = (k: keyof MeetingHeaderValue) => v[k] ?? meeting[k];
        return (
          <>
            <input type="hidden" name="meetingId" value={meeting.id} />
            {group === "header" && (
              <>
                <FloatingField id="topic" label="หัวข้อการประชุม" required defaultValue={val("topic")} />
                <FloatingField id="meetingDate" label="วันที่ประชุม" type="date" required defaultValue={val("meetingDate")} />
                <div className="row g-2">
                  <div className="col-6"><FloatingField id="startTime" label="เวลาเริ่ม" type="time" defaultValue={val("startTime")} /></div>
                  <div className="col-6"><FloatingField id="endTime" label="เวลาสิ้นสุด" type="time" defaultValue={val("endTime")} /></div>
                </div>
                <FloatingField id="place" label="สถานที่" defaultValue={val("place")} />
                <datalist id="meeting-people">
                  {people.map((p) => <option key={p} value={p} />)}
                </datalist>
                <FloatingField id="recorder" label="ผู้บันทึก ชื่อ (ตำแหน่ง)" list="meeting-people" defaultValue={val("recorder")} />
                <FloatingField id="organizer" label="ผู้จัดประชุม ชื่อ (ตำแหน่ง)" list="meeting-people" defaultValue={val("organizer")} />
              </>
            )}
            {group === "purpose" && <FloatingTextarea id="purpose" label="วัตถุประสงค์การประชุม" defaultValue={val("purpose")} />}
            {group === "previous" && (
              <>
                <FloatingSelect key={`prev-${v.previousId ?? ""}`} id="previousId" label="การประชุมครั้งก่อน" defaultValue={val("previousId")}>
                  <Opt options={previousOptions} empty="ไม่มี" />
                </FloatingSelect>
                <div className="form-text mt-0">ประเด็นค้างจะถูกยกมาเฉพาะตอนสร้างการประชุมเท่านั้น การเปลี่ยนการประชุมครั้งก่อนที่นี่ไม่ยกประเด็นมาเพิ่ม</div>
                <FloatingTextarea id="previousNote" label="หมายเหตุ" rows={3} defaultValue={val("previousNote")} />
              </>
            )}
            {group === "next" && (
              <>
                <FloatingField id="nextTopic" label="หัวข้อ" defaultValue={val("nextTopic")} />
                <FloatingField id="nextDate" label="วันที่" type="date" defaultValue={val("nextDate")} />
                <div className="row g-2">
                  <div className="col-6"><FloatingField id="nextStartTime" label="เวลาเริ่ม" type="time" defaultValue={val("nextStartTime")} /></div>
                  <div className="col-6"><FloatingField id="nextEndTime" label="เวลาสิ้นสุด" type="time" defaultValue={val("nextEndTime")} /></div>
                </div>
                <FloatingField id="nextPlace" label="สถานที่" defaultValue={val("nextPlace")} />
              </>
            )}
          </>
        );
      }}
    </FormDialog>
  );
}

/** Approve / back-to-Draft: confirm, run, show the service's error next to the button. */
export function MeetingStatusButton({
  label,
  icon,
  confirmText,
  action,
  variant = "primary",
}: {
  label: string;
  icon: string;
  confirmText: string;
  action: () => Promise<State>;
  variant?: "primary" | "outline-primary";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          startTransition(async () => {
            const r = await action();
            setError(r.error ?? null);
          });
        }}
      >
        <Icon name={icon} />
        {label}
      </Button>
      {error && <div role="alert" className="row-error small text-danger text-pre-wrap">{error}</div>}
    </>
  );
}

// ---------- attendees ----------

export type AttendeeFormValue = {
  id: string;
  userId: string;
  fullName: string;
  position: string;
  organization: string;
  projectRole: string;
  present: boolean;
};

function AttendeeFields({ v, attendee, members }: { v: Record<string, string>; attendee?: AttendeeFormValue; members: MemberOption[] }) {
  const init = (k: "userId" | "fullName" | "position" | "organization" | "projectRole") => v[k] ?? attendee?.[k] ?? "";
  const [userId, setUserId] = useState(init("userId"));
  const [fullName, setFullName] = useState(init("fullName"));
  const [position, setPosition] = useState(init("position"));
  const [projectRole, setProjectRole] = useState(init("projectRole"));
  return (
    <>
      <FloatingSelect
        id="userId"
        label="สมาชิกโครงการ"
        value={userId}
        onChange={(e) => {
          const id = e.target.value;
          setUserId(id);
          const m = members.find((x) => x.userId === id);
          if (m) {
            setFullName(m.fullName);
            setPosition(m.position);
            setProjectRole(m.roleLabel);
          }
        }}
      >
        <option value="">บุคคลภายนอก (พิมพ์ชื่อ)</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>{m.fullName}</option>
        ))}
      </FloatingSelect>
      <FloatingField id="fullName" label="ชื่อ-สกุล" required={!userId} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <FloatingField id="position" label="ตำแหน่ง" value={position} onChange={(e) => setPosition(e.target.value)} />
      <FloatingField id="organization" label="หน่วยงาน" defaultValue={init("organization")} />
      <FloatingField id="projectRole" label="บทบาทในโครงการ" value={projectRole} onChange={(e) => setProjectRole(e.target.value)} />
      <FloatingSelect id="present" label="การเข้าร่วม" defaultValue={v.present ?? (attendee && !attendee.present ? "false" : "true")}>
        <option value="true">เข้าร่วม</option>
        <option value="false">ไม่เข้าร่วม</option>
      </FloatingSelect>
    </>
  );
}

export function AttendeeDialog({ meetingId, attendee, members }: { meetingId: string; attendee?: AttendeeFormValue; members: MemberOption[] }) {
  return (
    <FormDialog
      title={attendee ? `แก้ไขผู้เข้าร่วม ${attendee.fullName}` : "เพิ่มผู้เข้าร่วม"}
      trigger={attendee ? "แก้ไข" : "เพิ่มผู้เข้าร่วม"}
      triggerIcon={attendee ? "edit" : "person_add"}
      iconOnly={!!attendee}
      action={attendee ? updateAttendeeAction : addAttendeeAction}
    >
      {(v) => (
        <>
          {attendee ? <input type="hidden" name="attendeeId" value={attendee.id} /> : <input type="hidden" name="meetingId" value={meetingId} />}
          <AttendeeFields v={v} attendee={attendee} members={members} />
        </>
      )}
    </FormDialog>
  );
}

// ---------- items ----------

const ADD_LABEL: Record<string, string> = {
  ACCOMPLISHED: "เพิ่มสิ่งที่ดำเนินการแล้วเสร็จ",
  ISSUE: "เพิ่มประเด็นที่เกี่ยวข้อง",
  OPEN_ISSUE: "เพิ่มประเด็นค้าง",
  AGREEMENT: "เพิ่มข้อตกลง",
};

export function ItemDialog({
  meetingId,
  kind,
  item,
  members = [],
}: {
  meetingId: string;
  kind: keyof typeof MEETING_ITEM_KIND_LABEL;
  item?: ItemFormValue;
  /** Owner choices (open issues only). */
  members?: Option[];
}) {
  const isIssue = kind === "OPEN_ISSUE";
  return (
    <FormDialog
      title={item ? `แก้ไข${MEETING_ITEM_KIND_LABEL[kind]}` : ADD_LABEL[kind]}
      trigger={item ? "แก้ไข" : ADD_LABEL[kind]}
      triggerIcon={item ? "edit" : "add"}
      iconOnly={!!item}
      action={item ? updateItemAction : addItemAction}
    >
      {(v) => {
        const val = (k: keyof ItemFormValue) => v[k] ?? (item ? String(item[k]) : "");
        return (
          <>
            {item ? <input type="hidden" name="itemId" value={item.id} /> : (
              <>
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="kind" value={kind} />
              </>
            )}
            <FloatingTextarea id="text" label={isIssue ? "ประเด็น" : "ข้อความ"} rows={3} required defaultValue={val("text")} />
            {isIssue && (
              <>
                <FloatingSelect key={`owner-${v.ownerId ?? ""}`} id="ownerId" label="ผู้รับผิดชอบ (สมาชิก)" defaultValue={val("ownerId")}>
                  <Opt options={members} empty="ไม่ระบุ / พิมพ์ชื่อด้านล่าง" />
                </FloatingSelect>
                <FloatingField id="ownerName" label="ชื่อผู้รับผิดชอบ (ถ้าไม่ใช่สมาชิก)" defaultValue={val("ownerName")} />
                <FloatingField id="dueDate" label="กำหนดชี้แจง" type="date" defaultValue={val("dueDate")} />
                {item?.linked ? (
                  <p className="small text-body-secondary mb-0">สถานะตาม Task ที่โยงอยู่</p>
                ) : (
                  <FloatingSelect key={`status-${v.status ?? ""}`} id="status" label="สถานะ" defaultValue={val("status") || "OPEN"}>
                    {(["OPEN", "CLOSED"] as const).map((s) => (
                      <option key={s} value={s}>{OPEN_ISSUE_STATUS_LABEL[s]}</option>
                    ))}
                  </FloatingSelect>
                )}
              </>
            )}
          </>
        );
      }}
    </FormDialog>
  );
}

export function CreateTaskFromIssueDialog({
  itemId,
  title,
  assigneeId,
  plannedEnd,
  assignees,
}: {
  itemId: string;
  title: string;
  assigneeId: string;
  plannedEnd: string;
  /** Members with a working role. */
  assignees: Option[];
}) {
  return (
    <FormDialog title="สร้าง Task จากประเด็นค้าง" trigger="สร้าง Task" triggerIcon="add_task" iconOnly action={createTaskFromIssueAction}>
      {(v) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          <FloatingField id="title" label="ชื่องาน" required defaultValue={v.title ?? title} />
          <FloatingSelect key={`assignee-${v.assigneeId ?? ""}`} id="assigneeId" label="ผู้รับผิดชอบ" defaultValue={v.assigneeId ?? assigneeId}>
            <Opt options={assignees} empty="ยังไม่ระบุ" />
          </FloatingSelect>
          <FloatingField id="plannedEnd" label="วันสิ้นสุดตามแผน" type="date" defaultValue={v.plannedEnd ?? plannedEnd} />
          <p className="small text-body-secondary mb-0">Task ชนิด Plan สถานะ Todo จะโยงกับประเด็นนี้</p>
        </>
      )}
    </FormDialog>
  );
}

export function LinkTaskDialog({ itemId, taskId, tasks }: { itemId: string; taskId: string; tasks: Option[] }) {
  return (
    <FormDialog title="โยงประเด็นกับ Task" trigger="โยง Task" triggerIcon="link" iconOnly action={linkIssueToTaskAction}>
      {(v) => (
        <>
          <input type="hidden" name="itemId" value={itemId} />
          <FloatingSelect key={`task-${v.taskId ?? ""}`} id="taskId" label="Task" defaultValue={v.taskId ?? taskId}>
            <Opt options={tasks} empty="ไม่โยง (ยกเลิกการโยง)" />
          </FloatingSelect>
        </>
      )}
    </FormDialog>
  );
}

// ---------- attachments ----------


async function attachWithCheck(prev: State, fd: FormData): Promise<State> {
  const f = fd.get("file");
  if (f instanceof File && f.size > MAX_FILE_BYTES) return { error: FILE_TOO_LARGE_MESSAGE, values: { kind: String(fd.get("kind") ?? "") } };
  return addMeetingAttachmentAction(prev, fd);
}

export function MeetingAttachmentDialog({ projectId, meetingId }: { projectId: string; meetingId: string }) {
  return (
    <FormDialog title="แนบไฟล์การประชุม" trigger="แนบไฟล์" triggerIcon="attach_file" action={attachWithCheck} submitLabel="แนบไฟล์">
      {(v) => (
        <>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <FloatingSelect id="attach-kind" name="kind" label="ประเภท" defaultValue={v.kind ?? "SIGNED"}>
            {(Object.keys(MEETING_ATTACHMENT_KIND_LABEL) as (keyof typeof MEETING_ATTACHMENT_KIND_LABEL)[]).map((k) => (
              <option key={k} value={k}>{MEETING_ATTACHMENT_KIND_LABEL[k]}</option>
            ))}
          </FloatingSelect>
          <FileField id="attach-file" name="file" label="ไฟล์ (ไม่เกิน 50 MB)" required />
        </>
      )}
    </FormDialog>
  );
}
