import type { MeetingItemKind, MeetingStatus, OpenIssueStatus, TaskStatus } from "@prisma/client";
import { defineGeneratedWp } from "@/features/docgen/types";
import { formatThaiDate } from "@/lib/dates";
import { OPEN_ISSUE_STATUS_LABEL } from "@/lib/labels";
import { effectiveIssueStatus } from "./issue-status";

/**
 * What the WP07 Meeting Record needs. A `MeetingDetail` (from the meeting service) plus the project satisfies it:
 * `meetingDocData({ ...detail, project: { name, code } })`.
 */
export type MeetingDocSource = {
  code: string;
  status: MeetingStatus;
  topic: string;
  meetingDate: Date;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  recorder: string | null;
  organizer: string | null;
  purpose: string | null;
  previous: { code: string; meetingDate: Date } | null;
  previousNote: string | null;
  nextTopic: string | null;
  nextDate: Date | null;
  nextStartTime: string | null;
  nextEndTime: string | null;
  nextPlace: string | null;
  attendees: {
    order: number;
    fullName: string;
    position: string | null;
    organization: string | null;
    projectRole: string | null;
    present: boolean;
  }[];
  items: {
    kind: MeetingItemKind;
    order: number;
    text: string;
    ownerName: string | null;
    dueDate: Date | null;
    status: OpenIssueStatus;
    task: { code: string; status: TaskStatus } | null;
  }[];
  project: { name: string; code: string };
};

const CHECKED = "☑";
const UNCHECKED = "☐";

const s = (v: string | null | undefined): string => v ?? "";

/** `09:30 – 11:30 น.`; start only `09:30 น.`; end only `– 11:30 น.`; neither → empty. */
function timeRange(start: string | null, end: string | null): string {
  if (start && end) return `${start} – ${end} น.`;
  if (start) return `${start} น.`;
  if (end) return `– ${end} น.`;
  return "";
}

function previousRef(m: MeetingDocSource): string {
  const note = m.previousNote?.trim() ?? "";
  if (m.previous) {
    const ref = `${m.previous.code} วันที่ ${formatThaiDate(m.previous.meetingDate)}`;
    return note ? `${ref} – ${note}` : ref;
  }
  return note || "ไม่มี";
}

const byOrder = <T extends { order: number }>(list: T[]) => [...list].sort((a, b) => a.order - b.order);

/** Values for every WP07 tag. Pure; null/undefined become "", dates are DD/MM/YYYY พ.ศ. */
export function meetingDocData(m: MeetingDocSource): Record<string, unknown> {
  const attendees = byOrder(m.attendees);
  const items = (kind: MeetingItemKind) => byOrder(m.items.filter((i) => i.kind === kind));
  const textList = (kind: MeetingItemKind) => items(kind).map((i) => ({ text: i.text }));
  return {
    mrNo: m.code,
    docDate: formatThaiDate(m.meetingDate),
    projectName: s(m.project.name),
    projectCode: s(m.project.code),
    topic: s(m.topic),
    meetingDate: formatThaiDate(m.meetingDate),
    meetingTime: timeRange(m.startTime, m.endTime),
    place: s(m.place),
    recorder: s(m.recorder),
    organizer: s(m.organizer),
    draftBox: m.status === "DRAFT" ? CHECKED : UNCHECKED,
    approvedBox: m.status === "APPROVED" ? CHECKED : UNCHECKED,
    purpose: s(m.purpose),
    attendees: attendees
      .filter((a) => a.present)
      .map((a, i) => ({ no: i + 1, name: a.fullName, position: s(a.position), organization: s(a.organization), role: s(a.projectRole) })),
    absentees: attendees
      .filter((a) => !a.present)
      .map((a) => a.fullName)
      .join(", "),
    previousRef: previousRef(m),
    accomplished: textList("ACCOMPLISHED"),
    issues: textList("ISSUE"),
    openIssues: items("OPEN_ISSUE").map((i, n) => {
      const label = OPEN_ISSUE_STATUS_LABEL[effectiveIssueStatus(i)];
      return {
        no: n + 1,
        text: i.text,
        owner: s(i.ownerName),
        due: formatThaiDate(i.dueDate),
        status: i.task ? `${label} (${i.task.code})` : label,
      };
    }),
    agreements: textList("AGREEMENT"),
    nextTopic: s(m.nextTopic),
    nextDate: formatThaiDate(m.nextDate),
    nextTime: timeRange(m.nextStartTime, m.nextEndTime),
    nextPlace: s(m.nextPlace),
  };
}

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const blankRows = <T>(row: (no: number) => T): T[] => [1, 2, 3].map(row);

const SAMPLE: MeetingDocSource = {
  code: "MR-2569-03",
  status: "APPROVED",
  topic: "ทบทวนแผนงานครั้งที่ 1",
  meetingDate: d("2026-12-15"),
  startTime: "09:30",
  endTime: "11:30",
  place: "ห้องประชุม 2",
  recorder: "สมหญิง รักงาน (นักวิเคราะห์)",
  organizer: "สมชาย ใจดี (ผู้จัดการโครงการ)",
  purpose: "ทบทวนความคืบหน้าและประเด็นค้าง",
  previous: { code: "MR-2569-02", meetingDate: d("2026-12-01") },
  previousNote: null,
  nextTopic: "ติดตามความคืบหน้า ครั้งที่ 2",
  nextDate: d("2026-12-29"),
  nextStartTime: "09:30",
  nextEndTime: null,
  nextPlace: "Online",
  attendees: [
    { order: 1, fullName: "สมชาย ใจดี", position: "ผู้จัดการ", organization: "ฝ่ายพัฒนา", projectRole: "ผู้จัดการโครงการ", present: true },
    { order: 2, fullName: "สมหญิง รักงาน", position: "นักวิเคราะห์", organization: "ฝ่ายพัฒนา", projectRole: "นักวิเคราะห์", present: true },
    { order: 3, fullName: "สมศรี มีสุข", position: "ผู้แทนลูกค้า", organization: "ลูกค้า", projectRole: null, present: false },
  ],
  items: [
    { kind: "ACCOMPLISHED", order: 1, text: "จัดทำแผนโครงการ", ownerName: null, dueDate: null, status: "OPEN", task: null },
    { kind: "ISSUE", order: 1, text: "ขอบเขตรายงาน", ownerName: null, dueDate: null, status: "OPEN", task: null },
    {
      kind: "OPEN_ISSUE",
      order: 1,
      text: "ยืนยันรูปแบบรายงาน",
      ownerName: "สมหญิง รักงาน",
      dueDate: d("2026-12-22"),
      status: "OPEN",
      task: { code: "T-012", status: "DONE" },
    },
    { kind: "AGREEMENT", order: 1, text: "ส่งร่างรายงานภายในสัปดาห์หน้า", ownerName: null, dueDate: null, status: "OPEN", task: null },
  ],
  project: { name: "ระบบบริหารโครงการ", code: "INT-2569-001" },
};

const BLANK: Record<string, unknown> = {
  mrNo: "",
  docDate: "",
  projectName: "",
  projectCode: "",
  topic: "",
  meetingDate: "",
  meetingTime: "",
  place: "",
  recorder: "",
  organizer: "",
  draftBox: UNCHECKED,
  approvedBox: UNCHECKED,
  purpose: "",
  attendees: blankRows((no) => ({ no, name: "", position: "", organization: "", role: "" })),
  absentees: "",
  previousRef: "",
  accomplished: blankRows(() => ({ text: "" })),
  issues: blankRows(() => ({ text: "" })),
  openIssues: blankRows((no) => ({ no, text: "", owner: "", due: "", status: "" })),
  agreements: blankRows(() => ({ text: "" })),
  nextTopic: "",
  nextDate: "",
  nextTime: "",
  nextPlace: "",
};

export const WP07 = defineGeneratedWp({
  wpCode: "WP07",
  structure: [
    { name: "mrNo", meaning: "เลขที่บันทึกการประชุม (หัวกระดาษ)" },
    { name: "docDate", meaning: "วันที่เอกสาร = วันที่ประชุม (หัวกระดาษ)" },
    { name: "projectName", meaning: "ชื่อโครงการ" },
    { name: "projectCode", meaning: "รหัสโครงการ" },
    { name: "topic", meaning: "หัวข้อการประชุม" },
    { name: "meetingDate", meaning: "วันที่ประชุม" },
    { name: "meetingTime", meaning: "เวลาประชุม เช่น 09:30 – 11:30 น." },
    { name: "place", meaning: "สถานที่" },
    { name: "recorder", meaning: "ผู้บันทึก" },
    { name: "organizer", meaning: "ผู้จัดประชุม" },
    { name: "draftBox", meaning: "ช่องติ๊ก Draft (☑ หรือ ☐)" },
    { name: "approvedBox", meaning: "ช่องติ๊ก Approved (☑ หรือ ☐)" },
    { name: "purpose", meaning: "1 วัตถุประสงค์การประชุม" },
    {
      name: "attendees",
      meaning: "2 แถวผู้เข้าร่วม: {#attendees} ในช่องแรก … {/attendees} ในช่องสุดท้ายของแถวเดียว",
      inner: [
        { name: "no", meaning: "ลำดับ" },
        { name: "name", meaning: "ชื่อ-สกุล" },
        { name: "position", meaning: "ตำแหน่ง" },
        { name: "organization", meaning: "หน่วยงาน" },
        { name: "role", meaning: "บทบาทในโครงการ" },
      ],
    },
    { name: "absentees", meaning: "ผู้ไม่ได้เข้าร่วม คั่นด้วยจุลภาค" },
    { name: "previousRef", meaning: "4 อ้างอิงบันทึกการประชุมครั้งก่อน หรือ ไม่มี" },
    {
      name: "accomplished",
      meaning: "5 ย่อหน้ารายการ: {-w:p accomplished}{text}{/accomplished}",
      inner: [{ name: "text", meaning: "สิ่งที่ดำเนินการแล้วเสร็จ" }],
    },
    {
      name: "issues",
      meaning: "6 ย่อหน้ารายการ: {-w:p issues}{text}{/issues}",
      inner: [{ name: "text", meaning: "ประเด็นที่เกี่ยวข้อง" }],
    },
    {
      name: "openIssues",
      meaning: "7 แถวประเด็นค้าง: {#openIssues} ในช่องแรก … {/openIssues} ในช่องสุดท้าย",
      inner: [
        { name: "no", meaning: "ลำดับ" },
        { name: "text", meaning: "ประเด็นค้าง" },
        { name: "owner", meaning: "ผู้รับผิดชอบ" },
        { name: "due", meaning: "กำหนดชี้แจง" },
        { name: "status", meaning: "สถานะ เช่น ค้าง (T-012)" },
      ],
    },
    {
      name: "agreements",
      meaning: "8 ย่อหน้ารายการ: {-w:p agreements}{text}{/agreements}",
      inner: [{ name: "text", meaning: "ข้อตกลง" }],
    },
    { name: "nextTopic", meaning: "9 หัวข้อการประชุมครั้งต่อไป" },
    { name: "nextDate", meaning: "9 วันที่ประชุมครั้งต่อไป" },
    { name: "nextTime", meaning: "9 เวลาประชุมครั้งต่อไป" },
    { name: "nextPlace", meaning: "9 สถานที่ประชุมครั้งต่อไป" },
  ],
  sample: meetingDocData(SAMPLE),
  blank: BLANK,
});
