import { config as loadEnv } from "dotenv";
import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT, E2E_STORAGE_DIR } from "./e2e/config";

loadEnv({ quiet: true });

// `npm run screens` (E2E_SCREENS=1) runs only the screenshot capture; `npm run test:e2e` runs every other *.spec.ts.
const screens = process.env.E2E_SCREENS === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: screens ? "**/screens.spec.ts" : "**/*.spec.ts",
  testIgnore: screens ? [] : ["**/screens.spec.ts"],
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure", locale: "th-TH" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx next dev -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      FILE_STORAGE_DIR: E2E_STORAGE_DIR,
      SESSION_COOKIE_SECURE: "false",
      // Own build directory: never collide with a developer's `next dev` (which uses .next).
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
