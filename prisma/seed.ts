import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

config({ quiet: true });

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is required to run the seed");
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { username: "admin" },
      update: { passwordHash, systemRole: "ADMIN", active: true },
      create: { username: "admin", passwordHash, fullName: "ผู้ดูแลระบบ", systemRole: "ADMIN" },
    });
    await prisma.setting.upsert({
      where: { key: "company_name" },
      update: {},
      create: { key: "company_name", value: "ชื่อบริษัท" },
    });
    console.log("seed ok");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
