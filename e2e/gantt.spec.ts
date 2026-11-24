import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_USERNAME } from "./config";

const PROJECT = "GANTT-1";
const TYPO_PROJECT = "GANTT-2";
const PASSWORD = "gantt-Password-1";
const PM = { username: "gantt-pm", fullName: "กานต์ ผู้จัดการ" };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** The user, project, milestone and tasks are seeded through the services; the Gantt view is driven in the browser. */
test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("../src/lib/db");
  const { createUser } = await import("../src/features/users/service");
  const { createProject } = await import("../src/features/projects/service");
  const { createMilestone, createTask } = await import("../src/features/plan/service");
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: E2E_ADMIN_USERNAME } });
  const pm = await createUser(admin, { username: PM.username, fullName: PM.fullName, password: PASSWORD, systemRole: "USER" });
  if (!pm.ok) throw new Error(pm.error);
  const project = await createProject(admin, { code: PROJECT, name: "โครงการทดสอบ Gantt", pmUserId: pm.data.id });
  if (!project.ok) throw new Error(project.error);
  const pmUser = await prisma.user.findUniqueOrThrow({ where: { id: pm.data.id } });
  const pid = project.data.id;
  const must = <T,>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  must(await createMilestone(pmUser, pid, { name: "ส่งมอบรอบแรก", plannedDate: d("2026-12-31") }));
  // T-001 dated, in progress; T-002 a dated child; T-003 has no dates; T-004 spans two years (forces sideways scroll).
  const t1 = must(
    await createTask(pmUser, pid, {
      title: "วิเคราะห์ความต้องการ",
      wbsCode: "1",
      plannedStart: d("2026-11-02"),
      plannedEnd: d("2026-11-20"),
      status: "DOING",
      percent: 40,
      actualStart: d("2026-11-03"),
    }),
  );
  must(
    await createTask(pmUser, pid, {
      title: "ออกแบบหน้าจอ",
      wbsCode: "1.1",
      parentId: t1.id,
      plannedStart: d("2026-11-16"),
      plannedEnd: d("2026-12-11"),
    }),
  );
  must(await createTask(pmUser, pid, { title: "งานที่ยังไม่กำหนดวัน", wbsCode: "2", kind: "REVIEW" }));
  must(await createTask(pmUser, pid, { title: "บำรุงรักษาระบบ", wbsCode: "3", plannedStart: d("2026-12-01"), plannedEnd: d("2028-11-30") }));
  // A Buddhist year typed into a date input: the chart must cap its range and warn.
  const typo = must(await createProject(admin, { code: TYPO_PROJECT, name: "โครงการปีผิด", pmUserId: pm.data.id }));
  must(await createTask(pmUser, typo.id, { title: "งานปกติ", plannedStart: d("2026-11-02"), plannedEnd: d("2026-11-13") }));
  must(await createTask(pmUser, typo.id, { title: "งานพิมพ์ปีผิด", plannedStart: d("2569-11-02"), plannedEnd: d("2569-11-13") }));
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(PM.username);
  await page.getByLabel("รหัสผ่าน").fill(PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("Plan Gantt view: bars, filters, scale, links, small screen", async ({ page }) => {
  const base = `/projects/${PROJECT}`;
  const chart = page.getByRole("img", { name: "Gantt chart ของแผนงาน" });
  const bars = page.locator(".gantt-bar");

  await login(page);
  await page.goto(`${base}/plan`);
  // default view stays the table
  await expect(page.getByRole("row", { name: /T-001/ })).toBeVisible();
  await expect(chart).toHaveCount(0);

  await page.getByRole("link", { name: "Gantt", exact: true }).click();
  await expect(page).toHaveURL(/view=gantt/);
  await expect(chart).toBeVisible();
  await expect(bars).toHaveCount(3); // T-003 has no date
  await expect(page.locator(".gantt-names").getByRole("link")).toHaveCount(4);
  await expect(page.locator(".gantt-milestone")).toHaveCount(1);
  // late is spelled out next to the task, not shown by colour only (T-001 ended 20/11/2569 and is not done)
  await expect(page.locator(".gantt-names .gantt-late")).toHaveText(["เลยกำหนด"]);
  await expect(page.getByRole("region", { name: "ช่วงเวลาของ Gantt chart (เลื่อนซ้ายขวาได้)" })).toBeVisible();
  await expect(page.locator(".alert-warning")).toHaveCount(0);

  // filtering keeps the view; switching view keeps the filters; clearing filters keeps the view
  await page.getByLabel("สถานะ").selectOption("DOING");
  await page.getByRole("button", { name: "กรอง" }).click();
  await expect(page).toHaveURL(/status=DOING/);
  await expect(page).toHaveURL(/view=gantt/);
  await expect(bars).toHaveCount(1);
  await page.getByRole("link", { name: "ตาราง", exact: true }).click();
  await expect(page).toHaveURL(/status=DOING/);
  await expect(page).not.toHaveURL(/view=gantt/);
  await expect(page.getByRole("row", { name: /T-001/ })).toBeVisible();
  await page.getByRole("link", { name: "Gantt", exact: true }).click();
  await expect(page).toHaveURL(/status=DOING.*view=gantt|view=gantt.*status=DOING/);
  await page.getByRole("link", { name: "ล้างตัวกรอง" }).click();
  await expect(page).toHaveURL(/view=gantt/);
  await expect(page).not.toHaveURL(/status=/);
  await expect(bars).toHaveCount(3);
  await expect(page.getByLabel("สถานะ")).toHaveValue(""); // the form follows the cleared filters

  // filters that leave only undated tasks
  await page.getByLabel("ชนิด").selectOption("REVIEW");
  await page.getByRole("button", { name: "กรอง" }).click();
  await expect(page.getByText("ไม่พบ Task ที่กำหนดวันตามตัวกรอง")).toBeVisible();
  await expect(chart).toHaveCount(0);
  await page.getByRole("link", { name: "ล้างตัวกรอง" }).click();
  await expect(bars).toHaveCount(3);

  // month scale keeps the chart
  await page.getByRole("link", { name: "เดือน", exact: true }).click();
  await expect(page).toHaveURL(/scale=month/);
  await expect(chart).toBeVisible();
  await expect(bars).toHaveCount(3);
  await page.getByRole("link", { name: "สัปดาห์", exact: true }).click();
  await expect(page).not.toHaveURL(/scale=month/);

  // 375 px: the chart scrolls inside its card, the page does not scroll sideways
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(chart).toBeVisible();
  const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(pageScroll).toBe(true);
  const inner = await page.locator(".gantt-scroll").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(inner).toBe(true);
  await expect(page.locator(".gantt-names").getByRole("link", { name: "T-001" })).toBeInViewport();

  // a task code in the left column opens the task page
  await page.locator(".gantt-names").getByRole("link", { name: "T-002" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/plan/T-002$`));
  await expect(page.getByRole("heading", { name: /T-002 ออกแบบหน้าจอ/ })).toBeVisible();

  // a mistyped year: bounded chart, a warning, only the sane bar drawn
  await page.goto(`/projects/${TYPO_PROJECT}/plan?view=gantt`);
  await expect(page.locator(".alert-warning")).toContainText("เกิน 5 ปีจากวันนี้");
  await expect(chart).toBeVisible();
  await expect(bars).toHaveCount(1);
  const svgWidth = await chart.evaluate((el) => (el as SVGSVGElement).width.baseVal.value);
  expect(svgWidth).toBeLessThan(5 * 16 * 366 * 2);
});
