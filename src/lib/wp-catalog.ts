export type Phase = { no: number; folder: string; process: string };
export type WpDef = {
  code: string;
  seq: number;
  name: string;
  phaseNo: number;
  states: string[];
  generated: boolean;
};

export const PHASES: Phase[] = [
  { no: 1, folder: "Project Planning", process: "PM.01" },
  {
    no: 2,
    folder: "Project Plan Execution, Assessment and Control",
    process: "PM.02-PM.03",
  },
  { no: 3, folder: "Software Implementation Initiation", process: "SI.01" },
  { no: 4, folder: "Software Requirements Analysis", process: "SI.02" },
  {
    no: 5,
    folder: "Software Architectural and Detailed Design",
    process: "SI.03",
  },
  { no: 6, folder: "Software Construction", process: "SI.04" },
  { no: 7, folder: "Software Integration and Tests", process: "SI.05" },
  { no: 8, folder: "Software Product Assembly", process: "SI.06" },
  { no: 9, folder: "Project Closure", process: "PM.04" },
];

export const WP_CATALOG: WpDef[] = [
  {
    code: "WP02",
    seq: 1,
    name: "Agreement",
    phaseNo: 1,
    states: ["Reviewed", "Approved", "Baselined"],
    generated: false,
  },
  {
    code: "WP10",
    seq: 2,
    name: "Project Plan",
    phaseNo: 1,
    states: ["Reviewed", "Validated", "Accepted", "Updated"],
    generated: false,
  },
  {
    code: "WP11",
    seq: 3,
    name: "Project Repository",
    phaseNo: 1,
    states: ["Updated", "Recovered"],
    generated: true,
  },
  {
    code: "WP12",
    seq: 4,
    name: "Project Repository Backup",
    phaseNo: 1,
    states: ["Recovered"],
    generated: true,
  },
  {
    code: "WP07",
    seq: 5,
    name: "Meeting Record",
    phaseNo: 2,
    states: ["Approved"],
    generated: true,
  },
  {
    code: "WP09",
    seq: 6,
    name: "Progress Status Record",
    phaseNo: 2,
    states: ["Published"],
    generated: true,
  },
  {
    code: "WP03",
    seq: 7,
    name: "Change Request",
    phaseNo: 2,
    states: ["Initiated", "Evaluated", "Accepted", "Rejected"],
    generated: true,
  },
  {
    code: "WP04",
    seq: 8,
    name: "Correction Register",
    phaseNo: 2,
    states: ["Initiated", "Approved", "Completed"],
    generated: true,
  },
  {
    code: "WP23",
    seq: 9,
    name: "Verification Record",
    phaseNo: 2,
    states: ["Initiated", "Approved"],
    generated: true,
  },
  {
    code: "WP22",
    seq: 10,
    name: "Validation Record",
    phaseNo: 2,
    states: ["Initiated", "Approved"],
    generated: true,
  },
  {
    code: "WP05",
    seq: 11,
    name: "Implementation Environment",
    phaseNo: 3,
    states: ["Established"],
    generated: false,
  },
  {
    code: "WP13",
    seq: 12,
    name: "Requirements Specification",
    phaseNo: 4,
    states: ["Verified", "Validated", "Baselined"],
    generated: false,
  },
  {
    code: "WP21",
    seq: 13,
    name: "Traceability Record",
    phaseNo: 4,
    states: ["Verified", "Baselined", "Updated"],
    generated: true,
  },
  {
    code: "WP16",
    seq: 14,
    name: "Software Design",
    phaseNo: 5,
    states: ["Verified", "Approved"],
    generated: false,
  },
  {
    code: "WP19",
    seq: 15,
    name: "Test Cases and Test Procedures",
    phaseNo: 5,
    states: ["Verified", "Baselined"],
    generated: true,
  },
  {
    code: "WP15",
    seq: 16,
    name: "Software Components",
    phaseNo: 6,
    states: ["Unit tested", "Corrected", "Baselined"],
    generated: false,
  },
  {
    code: "WP14",
    seq: 17,
    name: "Software",
    phaseNo: 7,
    states: ["Tested", "Corrected", "Baselined"],
    generated: false,
  },
  {
    code: "WP20",
    seq: 18,
    name: "Test Report",
    phaseNo: 7,
    states: ["Initiated", "Corrected", "Baselined"],
    generated: true,
  },
  {
    code: "WP18",
    seq: 19,
    name: "Software User Documentation",
    phaseNo: 7,
    states: ["Preliminary", "Verified", "Baselined"],
    generated: false,
  },
  {
    code: "WP08",
    seq: 20,
    name: "Product Operation Guideline",
    phaseNo: 7,
    states: ["Verified", "Baselined"],
    generated: false,
  },
  {
    code: "WP06",
    seq: 21,
    name: "Maintenance Documentation",
    phaseNo: 8,
    states: ["Validated", "Baselined"],
    generated: false,
  },
  {
    code: "WP17",
    seq: 22,
    name: "Software Product",
    phaseNo: 8,
    states: ["Delivered", "Accepted"],
    generated: false,
  },
  {
    code: "WP01",
    seq: 23,
    name: "Acceptance Record",
    phaseNo: 9,
    states: ["Initiated", "Signed"],
    generated: false,
  },
];

export function getWp(code: string): WpDef {
  const wp = WP_CATALOG.find((w) => w.code === code);
  if (!wp) throw new Error(`Unknown work product code: ${code}`);
  return wp;
}

/** Statuses that close a work product; only roles with `document.baseline` may set or undo them. */
export const FINAL_STATUSES = ["Approved", "Published", "Baselined", "Accepted", "Rejected", "Completed", "Signed"] as const;

export function isFinalStatus(status: string): boolean {
  return (FINAL_STATUSES as readonly string[]).includes(status);
}
