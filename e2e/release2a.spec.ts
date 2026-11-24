import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME } from "./config";

const PROJECT = "REL-2A";
const PASSWORD = "rel2a-Password-1";
const NEW_PASSWORD = "rel2a-Changed-2";
const USERS = {
  pm: { username: "r2a-pm", fullName: "ปราณี ผู้จัดการ", roles: ["PM"] },
  an: { username: "r2a-an", fullName: "อนันต์ นักวิเคราะห์", roles: ["AN"] },
  dev: { username: "r2a-dev", fullName: "ดวงใจ โปรแกรมเมอร์", roles: ["PR"] },
} as const;

/** Users and the project are seeded straight through the services; everything under test is driven in the browser. */
test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("../src/lib/db");
  const { createUser } = await import("../src/features/users/service");
  const { createProject } = await import("../src/features/projects/service");
  const { addMember } = await import("../src/features/members/service");
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: E2E_ADMIN_USERNAME } });
  const ids: Record<string, string> = {};
  for (const [key, u] of Object.entries(USERS)) {
    const r = await createUser(admin, { username: u.username, fullName: u.fullName, password: PASSWORD, systemRole: "USER" });
    if (!r.ok) throw new Error(r.error);
    ids[key] = r.data.id;
  }
  const project = await createProject(admin, { code: PROJECT, name: "โครงการ Release 2A", pmUserId: ids.pm });
  if (!project.ok) throw new Error(project.error);
  for (const key of ["an", "dev"] as const) {
    const r = await addMember(admin, project.data.id, {
      userId: ids[key],
      roles: [...USERS[key].roles],
      primaryRole: USERS[key].roles[0],
    });
    if (!r.ok) throw new Error(r.error);
  }
  await prisma.$disconnect();
});

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(username);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "โครงการ", exact: true })).toBeVisible();
}

async function logout(page: Page, fullName: string) {
  await page.getByRole("button", { name: fullName }).click();
  await page.getByRole("menuitem", { name: "ออกจากระบบ" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("Release 2A: plan, traceability, template download, own password", async ({ page }) => {
  const base = `/projects/${PROJECT}`;
  const dialog = page.getByRole("dialog");

  // 1. PM: milestone and a task for the developer
  await login(page, USERS.pm.username, PASSWORD);
  await page.goto(`${base}/plan`);
  await page.getByRole("button", { name: "เพิ่ม Milestone" }).click();
  await dialog.getByLabel("ชื่อ Milestone").fill("ส่งมอบรอบแรก");
  await dialog.getByLabel("วันตามแผน").fill("2026-12-31");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("cell", { name: "M1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "เพิ่ม Task" }).click();
  await dialog.getByLabel("ชื่องาน").fill("พัฒนาหน้าเข้าสู่ระบบ");
  await dialog.getByLabel("ผู้รับผิดชอบ").selectOption({ label: USERS.dev.fullName });
  await dialog.getByLabel("Milestone").selectOption({ label: "M1 ส่งมอบรอบแรก" });
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  const taskRow = page.getByRole("row", { name: /T-001/ });
  await expect(taskRow).toContainText("พัฒนาหน้าเข้าสู่ระบบ");

  // mobile: the task table keeps its action column inside the viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/plan`);
  const view = page.getByRole("row", { name: /T-001/ }).getByRole("link", { name: "ดูรายละเอียด" });
  await expect(view).toBeVisible();
  const box = await view.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // 2. PM downloads the WP07 template from the documents page
  await page.goto(`${base}/documents`);
  const wp07 = page.getByTestId("wp-row").filter({ hasText: "WP07 Meeting Record" });
  const link = wp07.getByRole("link", { name: "ดาวน์โหลด template" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const direct = await page.request.get(href!);
  expect(direct.status()).toBe(200);
  expect(direct.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("WP07_meeting_record.docx");
  // a name outside the store is a 404, with or without a session
  expect((await page.request.get("/api/templates/WP07/..%2F..%2Fpackage.json")).status()).toBe(404);
  expect((await page.request.get("/api/templates/WP07/nothing.docx")).status()).toBe(404);
  await logout(page, USERS.pm.fullName);
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);

  // 3. analyst: agreement scope, requirement, component, links
  await login(page, USERS.an.username, PASSWORD);
  await page.goto(`${base}/requirements`);
  await expect(page.getByRole("button", { name: "เพิ่ม Milestone" })).toHaveCount(0);
  await page.getByRole("button", { name: "เพิ่มขอบเขต" }).click();
  await dialog.getByLabel("รายละเอียด").fill("ระบบต้องให้ผู้ใช้เข้าสู่ระบบได้");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("cell", { name: "AG-01", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "เพิ่ม Requirement" }).click();
  await dialog.getByLabel("รายละเอียด").fill("ผู้ใช้ต้องเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน");
  await dialog.getByLabel("ขอบเขตตาม Agreement").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: "REQ-F01" })).toBeVisible();

  await page.goto(`${base}/components`);
  await page.getByRole("button", { name: "เพิ่ม Component" }).click();
  await dialog.getByLabel("ชื่อ Component").fill("โมดูลล็อกอิน");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: "C01" })).toBeVisible();

  await page.goto(`${base}/plan/T-001`);
  await page.getByRole("button", { name: "แก้การอ้างอิง" }).click();
  await dialog.getByLabel(/REQ-F01/).check();
  await dialog.getByLabel(/C01/).check();
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  const refs = page.locator("section", { hasText: "การอ้างอิง" }).last();
  await expect(refs.getByRole("link", { name: /REQ-F01/ })).toBeVisible();
  await expect(refs.getByRole("link", { name: /C01/ })).toBeVisible();

  // component page: the reverse link dialog shows the task link made above and saves
  await page.goto(`${base}/components/C01`);
  await page.getByRole("button", { name: "แก้การอ้างอิง" }).click();
  await expect(dialog.getByLabel(/T-001/)).toBeChecked();
  await dialog.getByLabel(/REQ-F01/).check();
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await page.goto(`${base}/requirements/REQ-F01`);
  await expect(page.getByRole("link", { name: /C01/ }).first()).toBeVisible();

  // trace: one complete row, no gap badge
  await page.goto(`${base}/trace`);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  for (const code of ["AG-01", "REQ-F01", "T-001", "C01"]) await expect(rows.first().getByRole("link", { name: code })).toBeVisible();
  for (const gap of ["ยังไม่มี Task", "ยังไม่มี Component", "ยังไม่มี Requirement", "ไม่ได้โยง AG"]) {
    await expect(page.getByText(gap)).toHaveCount(0);
  }
  await logout(page, USERS.an.fullName);

  // admin template overview: the folder and all 23 WPs
  await login(page, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD);
  await page.getByRole("link", { name: "Template", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates$/);
  await expect(page.getByTestId("templates-dir")).toContainText("templates");
  await expect(page.locator("tbody tr")).toHaveCount(23);
  await expect(page.getByText("ยังไม่มี template")).toHaveCount(0);
  await logout(page, "ผู้ดูแลระบบ");

  // 4. developer (not PM): sees own task on the home page, updates progress only
  await login(page, USERS.dev.username, PASSWORD);
  await expect(page.getByRole("link", { name: "T-001" })).toBeVisible();
  await page.goto(`${base}/plan/T-001`);
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "แก้การอ้างอิง" })).toHaveCount(0);
  await page.getByRole("button", { name: "อัปเดตความคืบหน้า" }).click();
  await dialog.getByLabel("สถานะ").selectOption({ label: "กำลังทำ" });
  await dialog.getByLabel("ความคืบหน้า (%)").fill("40");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("40%")).toBeVisible();

  // 5. developer changes own password and logs in with the new one
  await page.getByRole("button", { name: USERS.dev.fullName }).click();
  await page.getByRole("menuitem", { name: "เปลี่ยนรหัสผ่าน" }).click();
  await expect(page).toHaveURL(/\/account\/password$/);
  await page.getByLabel("รหัสผ่านเดิม").fill("wrong-password-1");
  await page.getByLabel("รหัสผ่านใหม่", { exact: false }).first().fill(NEW_PASSWORD);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("form p[role=alert]")).toHaveText("รหัสผ่านเดิมไม่ถูกต้อง");
  await page.getByLabel("รหัสผ่านเดิม").fill(PASSWORD);
  await page.getByLabel("รหัสผ่านใหม่", { exact: false }).first().fill(NEW_PASSWORD);
  await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByText("เปลี่ยนรหัสผ่านแล้ว")).toBeVisible();
  // still logged in on this session
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "โครงการ", exact: true })).toBeVisible();
  await logout(page, USERS.dev.fullName);
  await login(page, USERS.dev.username, NEW_PASSWORD);
  await logout(page, USERS.dev.fullName);
});
