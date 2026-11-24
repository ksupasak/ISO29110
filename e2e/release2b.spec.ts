import { expect, test, type Page } from "@playwright/test";
import PizZip from "pizzip";

const PROJECT = "REL-2B";
const PASSWORD = "rel2b-Password-1";
const USERS = {
  pm: { username: "r2b-pm", fullName: "พิมพ์ใจ ผู้จัดการ", roles: ["PM"] },
  an: { username: "r2b-an", fullName: "อรุณ นักวิเคราะห์", roles: ["AN"] },
  dev: { username: "r2b-dev", fullName: "เดชา โปรแกรมเมอร์", roles: ["PR"] },
} as const;
const TOPIC = "ทบทวนแผนงาน {รอบ 1} & ขอบเขต";
const ISSUE = "ยืนยันรูปแบบรายงานกับลูกค้า";

/** Users and the project are seeded straight through the services; everything under test is driven in the browser. */
test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("../src/lib/db");
  const { createUser } = await import("../src/features/users/service");
  const { createProject } = await import("../src/features/projects/service");
  const { addMember } = await import("../src/features/members/service");
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: "admin" } });
  const ids: Record<string, string> = {};
  for (const [key, u] of Object.entries(USERS)) {
    const r = await createUser(admin, { username: u.username, fullName: u.fullName, password: PASSWORD, systemRole: "USER" });
    if (!r.ok) throw new Error(r.error);
    ids[key] = r.data.id;
  }
  const project = await createProject(admin, { code: PROJECT, name: "โครงการ Release 2B", pmUserId: ids.pm });
  if (!project.ok) throw new Error(project.error);
  for (const key of ["an", "dev"] as const) {
    const r = await addMember(admin, project.data.id, { userId: ids[key], roles: [...USERS[key].roles], primaryRole: USERS[key].roles[0] });
    if (!r.ok) throw new Error(r.error);
  }
  await prisma.$disconnect();
});

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(username);
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/$/);
}

const docText = (buf: Buffer) =>
  [...new PizZip(buf).file("word/document.xml")!.asText().matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

test("Release 2B: meeting record, task from an open issue, approval, docx export, carry-forward", async ({ page }) => {
  const base = `/projects/${PROJECT}`;
  const dialog = page.getByRole("dialog");
  await login(page, USERS.pm.username);

  // 1. the menu leads to the meeting list; PM creates the first meeting
  await page.goto(base);
  await page.getByRole("link", { name: "การประชุม", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/meetings$`));
  await expect(page.getByText("ยังไม่มีการประชุม")).toBeVisible();
  await page.getByRole("button", { name: "สร้างการประชุม" }).click();
  await dialog.getByLabel("หัวข้อ").fill(TOPIC);
  await dialog.getByLabel("วันที่").fill("2026-12-15");
  await expect(dialog.getByText("ประเด็นค้างที่ยังไม่ปิดจะถูกยกมา")).toBeVisible();
  await dialog.getByRole("button", { name: "สร้าง" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/meetings/MR-2569-01$`));
  await expect(page.getByRole("heading", { name: `MR-2569-01 ${TOPIC}` })).toBeVisible();

  // 2. attendee picked from the members: the name is filled in
  await page.getByRole("button", { name: "เพิ่มผู้เข้าร่วม" }).click();
  await dialog.getByLabel("สมาชิกโครงการ").selectOption({ label: USERS.an.fullName });
  await expect(dialog.getByLabel("ชื่อ-สกุล")).toHaveValue(USERS.an.fullName);
  await dialog.getByLabel("หน่วยงาน").fill("ฝ่ายพัฒนา");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(USERS.an.fullName) })).toContainText("เข้าร่วม");

  // 3. an open issue, then a task from it
  await page.getByRole("button", { name: "เพิ่มประเด็นค้าง" }).click();
  await dialog.getByLabel("ประเด็น").fill(ISSUE);
  await dialog.getByLabel("ผู้รับผิดชอบ (สมาชิก)").selectOption({ label: USERS.dev.fullName });
  await dialog.getByLabel("กำหนดชี้แจง").fill("2026-12-22");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  const issueRow = page.getByRole("row", { name: new RegExp(ISSUE) });
  await expect(issueRow).toContainText("ค้าง");

  await issueRow.getByRole("button", { name: "สร้าง Task" }).click();
  await expect(dialog.getByLabel("ชื่องาน")).toHaveValue(ISSUE);
  await expect(dialog.getByLabel("วันสิ้นสุดตามแผน")).toHaveValue("2026-12-22");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(issueRow.getByRole("link", { name: "T-001" })).toBeVisible();
  await expect(issueRow.getByRole("button", { name: "สร้าง Task" })).toHaveCount(0);

  // the task page names the meeting the task came from
  await page.goto(`${base}/plan/T-001`);
  await expect(page.getByRole("region", { name: "ประเด็นประชุมต้นทาง" }).getByRole("link", { name: "MR-2569-01" })).toBeVisible();
  await page.goto(`${base}/meetings/MR-2569-01`);

  // 4. approve: read-only afterwards
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "อนุมัติ" }).click();
  await expect(page.getByRole("button", { name: "กลับเป็น Draft" })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  for (const name of ["เพิ่มผู้เข้าร่วม", "เพิ่มประเด็นค้าง", "สร้าง Task", "โยง Task", "ลบ", "อนุมัติ"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /^แก้ไข/ })).toHaveCount(0);
  // signed copies may still be attached
  await expect(page.getByRole("button", { name: "แนบไฟล์" })).toBeVisible();

  // 5. export: the approved docx carries the topic and the task code
  const exportLink = page.getByRole("link", { name: "ส่งออก docx" });
  const href = await exportLink.getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  expect(res.headers()["content-disposition"]).toContain(`${PROJECT}_MR-2569-01.docx`);
  const text = docText(Buffer.from(await res.body()));
  expect(text).toContain("ทบทวนแผนงาน {รอบ 1} &amp; ขอบเขต");
  expect(text).toContain("T-001");
  expect(text).toContain("☑  Approved");
  const [download] = await Promise.all([page.waitForEvent("download"), exportLink.click()]);
  expect(download.suggestedFilename()).toBe(`${PROJECT}_MR-2569-01.docx`);

  // 6. the next meeting carries the open issue forward
  await page.goto(`${base}/meetings`);
  await page.getByRole("button", { name: "สร้างการประชุม" }).click();
  await dialog.getByLabel("หัวข้อ").fill("ติดตามงาน ครั้งที่ 2");
  await dialog.getByLabel("วันที่").fill("2026-12-29");
  await dialog.getByLabel("การประชุมครั้งก่อน").selectOption({ label: `MR-2569-01 ${TOPIC} (15/12/2569)` });
  await dialog.getByRole("button", { name: "สร้าง" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/meetings/MR-2569-02$`));
  const carried = page.getByRole("row", { name: new RegExp(ISSUE) });
  await expect(carried).toContainText("ยกมาจาก MR-2569-01");
  await expect(carried.getByRole("link", { name: "T-001" })).toBeVisible();

  // documents page: WP07 leads to the meetings
  await page.goto(`${base}/documents`);
  await page.getByTestId("wp-row").filter({ hasText: "WP07 Meeting Record" }).getByRole("link", { name: "ไปที่การประชุม" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/meetings$`));
  await expect(page.locator("tbody tr")).toHaveCount(2);

  // 7. the developer only reads: export yes, no edit controls even on the Draft
  await page.context().clearCookies();
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
  await login(page, USERS.dev.username);
  await page.goto(`${base}/meetings/MR-2569-02`);
  await expect(page.getByRole("link", { name: "ส่งออก docx" })).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้าง Task" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "อนุมัติ" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^แก้ไข/ })).toHaveCount(0);
  await page.goto(`${base}/meetings`);
  await expect(page.getByRole("button", { name: "สร้างการประชุม" })).toHaveCount(0);
});
