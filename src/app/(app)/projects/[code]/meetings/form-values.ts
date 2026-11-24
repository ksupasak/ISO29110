import type { MeetingDetail, MeetingItemView } from "@/features/meetings/service";

export const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Every header field of a meeting as form strings; dialogs post all of them (the service clears absent ones). */
export type MeetingHeaderValue = {
  id: string;
  topic: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  place: string;
  recorder: string;
  organizer: string;
  purpose: string;
  previousId: string;
  previousNote: string;
  nextTopic: string;
  nextDate: string;
  nextStartTime: string;
  nextEndTime: string;
  nextPlace: string;
};

export function meetingHeaderValue(m: MeetingDetail): MeetingHeaderValue {
  return {
    id: m.id,
    topic: m.topic,
    meetingDate: isoDate(m.meetingDate),
    startTime: m.startTime ?? "",
    endTime: m.endTime ?? "",
    place: m.place ?? "",
    recorder: m.recorder ?? "",
    organizer: m.organizer ?? "",
    purpose: m.purpose ?? "",
    previousId: m.previousId ?? "",
    previousNote: m.previousNote ?? "",
    nextTopic: m.nextTopic ?? "",
    nextDate: isoDate(m.nextDate),
    nextStartTime: m.nextStartTime ?? "",
    nextEndTime: m.nextEndTime ?? "",
    nextPlace: m.nextPlace ?? "",
  };
}

export type ItemFormValue = {
  id: string;
  kind: string;
  text: string;
  ownerId: string;
  /** Only a typed (non-member) name; a member owner's name comes from the member. */
  ownerName: string;
  dueDate: string;
  status: string;
  linked: boolean;
};

export function itemFormValue(i: MeetingItemView): ItemFormValue {
  return {
    id: i.id,
    kind: i.kind,
    text: i.text,
    ownerId: i.ownerId ?? "",
    ownerName: i.ownerId ? "" : (i.ownerName ?? ""),
    dueDate: isoDate(i.dueDate),
    status: i.status,
    linked: i.task !== null,
  };
}

/** `09:30 – 11:30 น.`, start only `09:30 น.`, none → "-". */
export function timeRange(start: string | null, end: string | null): string {
  if (start && end) return `${start} – ${end} น.`;
  if (start) return `${start} น.`;
  if (end) return `– ${end} น.`;
  return "-";
}

/** Attachment kinds as the meeting page names them (a signed copy is the usual upload). */
export const MEETING_ATTACHMENT_KIND_LABEL = { SIGNED: "ฉบับเซ็น", EVIDENCE: "หลักฐาน", OTHER: "อื่น ๆ" } as const;
