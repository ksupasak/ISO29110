// Shared by playwright.config.ts, e2e/global-setup.ts and the scenario.
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_ADMIN_USERNAME = "admin";
// Test-only password: the test database is reset on every run. Never the dev one.
export const E2E_ADMIN_PASSWORD = "e2e-admin-Pass-1";
export const E2E_STORAGE_DIR = "./test-storage";
