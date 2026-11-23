import { execSync } from "node:child_process";
import { config } from "dotenv";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME, E2E_STORAGE_DIR } from "./config";

export default async function globalSetup() {
  config({ quiet: true });
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL is not set (copy .env.example to .env)");
  // Must be set before @/lib/db is imported: the Prisma client reads it on construction.
  process.env.DATABASE_URL = testUrl;
  process.env.FILE_STORAGE_DIR = E2E_STORAGE_DIR;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });

  const { resetDb } = await import("../tests/setup/db");
  const { prisma } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/auth/password");
  await resetDb();
  await prisma.user.create({
    data: {
      username: E2E_ADMIN_USERNAME,
      passwordHash: await hashPassword(E2E_ADMIN_PASSWORD),
      fullName: "ผู้ดูแลระบบ",
      systemRole: "ADMIN",
    },
  });
  await prisma.$disconnect();
}
