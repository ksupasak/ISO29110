import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ quiet: true });
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL is not set (copy .env.example to .env)");
  process.env.DATABASE_URL = testUrl;
  process.env.FILE_STORAGE_DIR = "./test-storage";
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: process.env });
}
