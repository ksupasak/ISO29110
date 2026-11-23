import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME } from "./config";

const PM_USERNAME = "pm1";
const PM_PASSWORD = "pm1-Password-1";
const PM_NAME = "สมชาย ใจดี";
const PROJECT_CODE = "INT-2569-001";
const FIXTURE = path.join(process.cwd(), "e2e", "fixtures", "แผนโครงการ.docx");

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

test("Release 1: admin sets up a project, PM uploads and reviews a WP document", async ({ page }) => {
  // 1. admin creates user pm1 and project INT-2569-001
  await login(page, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD);
  await page.getByRole("link", { name: "ผู้ใช้งาน" }).click();
  await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).click();
  const userDialog = page.getByRole("dialog");
  await userDialog.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(PM_USERNAME);
  await userDialog.getByLabel("ชื่อ-นามสกุล").fill(PM_NAME);
  await userDialog.getByLabel("รหัสผ่าน", { exact: false }).fill(PM_PASSWORD);
  await userDialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(userDialog).toBeHidden();
  await expect(page.getByRole("cell", { name: PM_USERNAME, exact: true })).toBeVisible();

  await page.getByRole("link", { name: "โครงการ", exact: true }).click();
  await page.getByRole("link", { name: "สร้างโครงการ" }).click();
  await page.getByLabel("รหัสโครงการ").fill(PROJECT_CODE);
  await page.getByLabel("ชื่อโครงการ").fill("โครงการทดสอบ");
  await page.getByLabel("ผู้จัดการโครงการ (PM)").selectOption({ label: `${PM_NAME} (${PM_USERNAME})` });
  await page.getByRole("button", { name: "สร้างโครงการ" }).click();
  await expect(page.getByRole("link", { name: new RegExp(PROJECT_CODE) })).toBeVisible();
  await logout(page, "ผู้ดูแลระบบ");

  // 2. pm1 sees the team on the project overview
  await login(page, PM_USERNAME, PM_PASSWORD);
  await page.getByRole("link", { name: new RegExp(PROJECT_CODE) }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT_CODE}$`));
  const teamRow = page.getByRole("row", { name: new RegExp(PM_NAME) });
  await expect(teamRow).toContainText("ผู้จัดการโครงการ");
  await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: "เอกสาร" }).click();

  // 3. nine phases, 23 WPs
  await expect(page.getByTestId("phase-heading")).toHaveCount(9);
  await expect(page.getByTestId("wp-row")).toHaveCount(23);

  // 4. upload version 1.0 on WP10, then mark it Reviewed
  const wp10 = page.getByTestId("wp-row").filter({ hasText: "WP10 Project Plan" });
  await wp10.getByRole("button", { name: "อัปโหลดเวอร์ชันใหม่" }).click();
  const uploadDialog = page.getByRole("dialog");
  await uploadDialog.getByLabel("เวอร์ชัน").fill("1.0");
  await uploadDialog.locator('input[type="file"]').setInputFiles(FIXTURE);
  await uploadDialog.getByRole("button", { name: "อัปโหลด", exact: true }).click();
  await expect(uploadDialog).toBeHidden();
  await expect(wp10).toContainText("เวอร์ชันปัจจุบัน 1.0");

  await wp10.getByLabel("สถานะ WP10").selectOption("Reviewed");
  await expect(wp10.locator("span", { hasText: /^Reviewed$/ })).toBeVisible();
  await expect(wp10.getByLabel("สถานะ WP10")).toHaveValue("Reviewed");

  // the stored file downloads under its original Thai name
  await wp10.getByText("ประวัติเวอร์ชัน").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    wp10.getByRole("link", { name: "แผนโครงการ.docx" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("แผนโครงการ.docx");

  // 5. after logout the project is no longer reachable
  await logout(page, PM_NAME);
  await page.goto(`/projects/${PROJECT_CODE}`);
  await expect(page).toHaveURL(/\/login$/);
});
