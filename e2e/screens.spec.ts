// Captures the UI screenshot set in docs/screenshots/ui-v2/. Runs only through `npm run screens` (see playwright.config.ts).
// Uses the e2e test database and storage only; the data below is created through the UI on top of the fresh admin account.
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME } from "./config";

const OUT_DIR = path.join(process.cwd(), "docs", "screenshots", "ui-v2");
const FIXTURE = path.join(process.cwd(), "e2e", "fixtures", "แผนโครงการ.docx");
const PROJECT_CODE = "INT-2569-001";
const PROJECT_NAME = "ระบบติดตามงานและคลังเอกสารโครงการภายในสำหรับทดสอบชื่อที่ยาวมากเป็นพิเศษ";
const LONG_FILE_NAME = `${"แผนงานโครงการระยะยาว".repeat(20)}`.slice(0, 115) + ".docx";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function shot(page: Page, name: string, viewport: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}-${viewport}.png`), fullPage: true,
    animations: "disabled",
    // Next's dev-only indicator is not part of the app.
    style: "nextjs-portal { display: none !important; }",
  });
}

test("capture screenshots", async ({ page }) => {
  test.setTimeout(180_000);
  expect(LONG_FILE_NAME).toHaveLength(120);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // login page, signed out
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
    await shot(page, "login", vp.name);
  }

  await page.setViewportSize(VIEWPORTS[0]);
  await page.getByLabel("ชื่อผู้ใช้").fill(E2E_ADMIN_USERNAME);
  await page.getByLabel("รหัสผ่าน").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "โครงการ", exact: true })).toBeVisible();

  // seed: one extra user, one project with a very long name, one version with a 120-character file name and one attachment
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).click();
  const userDialog = page.getByRole("dialog");
  await userDialog.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("somchai");
  await userDialog.getByLabel("ชื่อ-นามสกุล").fill("สมชาย ใจดี");
  await userDialog.getByLabel("ตำแหน่ง").fill("ผู้จัดการโครงการ");
  await userDialog.getByLabel("รหัสผ่าน", { exact: false }).fill("screens-Password-1");
  await userDialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(userDialog).toBeHidden();

  await page.goto("/projects/new");
  await page.getByLabel("รหัสโครงการ").fill(PROJECT_CODE);
  await page.getByLabel("ชื่อโครงการ").fill(PROJECT_NAME);
  await page.getByLabel("ชื่อย่อ").fill("ระบบภายใน");
  await page.getByLabel("ชื่อลูกค้า").fill("ฝ่ายเทคโนโลยีสารสนเทศ");
  await page.getByLabel("ผู้จัดการโครงการ (PM)").selectOption({ label: "สมชาย ใจดี (somchai)" });
  await page.getByRole("button", { name: "สร้างโครงการ" }).click();
  await expect(page.getByRole("link", { name: new RegExp(PROJECT_CODE) })).toBeVisible();

  await page.goto(`/projects/${PROJECT_CODE}/documents`);
  const wp10 = page.getByTestId("wp-row").filter({ hasText: "WP10 Project Plan" });
  await wp10.getByRole("button", { name: "อัปโหลดเวอร์ชันใหม่" }).click();
  const uploadDialog = page.getByRole("dialog");
  await uploadDialog.getByLabel("เวอร์ชัน").fill("1.0");
  await uploadDialog.locator('input[type="file"]').setInputFiles({
    name: LONG_FILE_NAME,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: fs.readFileSync(FIXTURE),
  });
  await uploadDialog.getByRole("button", { name: "อัปโหลด", exact: true }).click();
  await expect(uploadDialog).toBeHidden();
  await expect(wp10).toContainText("เวอร์ชันปัจจุบัน 1.0");
  await wp10.getByRole("button", { name: "แนบหลักฐาน" }).click();
  const attachDialog = page.getByRole("dialog");
  await attachDialog.locator('input[type="file"]').setInputFiles(FIXTURE);
  await attachDialog.getByRole("button", { name: "แนบไฟล์" }).click();
  await expect(attachDialog).toBeHidden();
  await expect(wp10.getByRole("button", { name: /ไฟล์แนบ/ })).toBeVisible();

  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);

    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(PROJECT_CODE) })).toBeVisible();
    await shot(page, "home", vp.name);

    await page.goto("/admin/users");
    await expect(page.getByRole("cell", { name: "somchai", exact: true })).toBeVisible();
    await shot(page, "users", vp.name);

    await page.goto(`/projects/${PROJECT_CODE}`);
    await expect(page.getByRole("row", { name: /สมชาย ใจดี/ })).toBeVisible();
    await shot(page, "project-overview", vp.name);

    await page.goto(`/projects/${PROJECT_CODE}/documents`);
    await expect(page.getByTestId("phase-heading")).toHaveCount(9);
    const row = page.getByTestId("wp-row").filter({ hasText: "WP10 Project Plan" });
    await row.getByRole("button", { name: /ประวัติเวอร์ชัน/ }).click();
    await expect(row.getByRole("link", { name: LONG_FILE_NAME })).toBeVisible();
    await shot(page, "documents", vp.name);

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("ชื่อผู้ใช้", { exact: true }).fill("somchai");
    await page.getByRole("dialog").getByLabel("ชื่อ-นามสกุล").fill("สมชาย ใจดี");
    await page.getByRole("dialog").getByLabel("รหัสผ่าน", { exact: false }).fill("screens-Password-1");
    await page.getByRole("dialog").getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    await shot(page, "dialog", vp.name);
  }
});
