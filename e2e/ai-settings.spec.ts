import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME } from "./config";

const PLAIN_USERNAME = "plain1";
const PLAIN_PASSWORD = "plain1-Password-1";
const PLAIN_NAME = "สมหญิง ธรรมดา";
const FAKE_MODEL = "fake-llama:8b";
const FAKE_REPLY = "พร้อมใช้งาน";

let fake: http.Server;
let fakeUrl = "";
const sockets = new Set<import("node:net").Socket>();

test.beforeAll(async () => {
  // Fake OpenAI-compatible server: never reach a real AI service from e2e.
  fake = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && req.url === "/v1/models") {
        res.end(JSON.stringify({ data: [{ id: "other-model" }, { id: FAKE_MODEL }] }));
      } else if (req.method === "POST" && req.url === "/v1/chat/completions") {
        res.end(JSON.stringify({ model: FAKE_MODEL, choices: [{ index: 0, message: { role: "assistant", content: FAKE_REPLY } }] }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  fake.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
});

test.afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise((r) => fake.close(r));
});

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(username);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function logout(page: Page, fullName: string) {
  await page.getByRole("button", { name: fullName }).click();
  await page.getByRole("menuitem", { name: "ออกจากระบบ" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("AI settings: admin configures a local model, tests it; a non-admin cannot open the page", async ({ page }) => {
  await login(page, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD);

  // admin creates a non-admin user for the access check at the end
  await page.getByRole("link", { name: "ผู้ใช้งาน" }).click();
  await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(PLAIN_USERNAME);
  await dialog.getByLabel("ชื่อ-นามสกุล").fill(PLAIN_NAME);
  await dialog.getByLabel("รหัสผ่าน", { exact: false }).fill(PLAIN_PASSWORD);
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "ตั้งค่า AI" }).click();
  await expect(page).toHaveURL(/\/admin\/ai$/);
  await expect(page.getByRole("heading", { name: "ตั้งค่า AI", level: 1 })).toBeVisible();
  await expect(page.getByText("ยังไม่ได้ตั้ง", { exact: true })).toBeVisible();

  await page.getByLabel("ผู้ให้บริการ").selectOption("local");
  await page.getByLabel("URL ปลายทาง").fill(fakeUrl);
  await page.getByRole("button", { name: "ดึงรายชื่อ model" }).click();
  await expect(page.getByText("พบ 2 model")).toBeVisible();
  await expect(page.locator("#modelOptions option")).toHaveCount(2);
  await page.getByLabel("Model", { exact: true }).fill(FAKE_MODEL);
  await page.getByLabel("API key", { exact: true }).fill("sk-e2e-key-wxyz");
  await page.getByLabel("เปิดใช้ AI").check();

  // provider switch swaps the controls and shows the warning, switching back restores them
  await page.getByLabel("ผู้ให้บริการ").selectOption("anthropic");
  await expect(page.getByText("เมื่อใช้ Claude เนื้อหาเอกสารจะถูกส่งออกนอกเครือข่ายของบริษัทไปยัง Anthropic")).toBeVisible();
  await expect(page.getByLabel("URL ปลายทาง")).toHaveCount(0);
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("claude-opus-5-5");
  await page.getByLabel("ผู้ให้บริการ").selectOption("local");
  await expect(page.getByText("เมื่อใช้ Claude")).toHaveCount(0);
  await expect(page.getByLabel("URL ปลายทาง")).toHaveValue(fakeUrl);
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(FAKE_MODEL);

  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  await expect(page.getByText("ตั้งค่าแล้ว (ลงท้าย ••••wxyz)")).toBeVisible();
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");

  await page.getByRole("button", { name: "ทดสอบการเชื่อมต่อ" }).click();
  const result = page.getByTestId("ai-test-result");
  await expect(result).toContainText(FAKE_REPLY);
  await expect(result).toContainText(FAKE_MODEL);
  await expect(result).toContainText(/\d+ ms/);

  // reload: saved values are shown, the key itself never is
  await page.reload();
  await expect(page.getByLabel("เปิดใช้ AI")).toBeChecked();
  await expect(page.getByLabel("ผู้ให้บริการ")).toHaveValue("local");
  await expect(page.getByLabel("URL ปลายทาง")).toHaveValue(fakeUrl);
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue(FAKE_MODEL);
  await expect(page.getByText("ตั้งค่าแล้ว (ลงท้าย ••••wxyz)")).toBeVisible();
  expect(await page.content()).not.toContain("sk-e2e-key-wxyz");

  // saving with an empty key field keeps the stored key
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  await expect(page.getByText("ตั้งค่าแล้ว (ลงท้าย ••••wxyz)")).toBeVisible();

  // a bad URL gives an inline Thai error
  await page.getByLabel("URL ปลายทาง").fill("ftp://x");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".alert-danger")).toContainText("URL ปลายทาง");

  await logout(page, "ผู้ดูแลระบบ");

  // non-admin: no menu entry, and the page is treated like /admin/users (not found)
  await login(page, PLAIN_USERNAME, PLAIN_PASSWORD);
  await expect(page.getByRole("link", { name: "ตั้งค่า AI" })).toHaveCount(0);
  await page.goto("/admin/users");
  const usersStatus = await page.getByRole("heading", { level: 1 }).innerText();
  await page.goto("/admin/ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(usersStatus);
  await expect(page.getByRole("heading", { name: "ไม่พบหน้าที่ต้องการ" })).toBeVisible();
});
