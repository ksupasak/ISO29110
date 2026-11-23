import { beforeEach, expect, test } from "vitest";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { authenticate } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createUser, listUsers, resetPassword, setUserActive, updateUser } from "@/features/users/service";

let admin: User;
let plain: User;

beforeEach(async () => {
  await resetDb();
  admin = await prisma.user.create({
    data: { username: "admin", passwordHash: await hashPassword("adminpass1"), fullName: "Admin", systemRole: "ADMIN" },
  });
  plain = await prisma.user.create({
    data: { username: "plain", passwordHash: await hashPassword("oldpass123"), fullName: "Plain" },
  });
});

const input = { username: "somchai", fullName: "สมชาย", password: "password1", systemRole: "USER" as const };

test("admin creates a user who can log in", async () => {
  const r = await createUser(admin, input);
  expect(r.ok).toBe(true);
  expect((await authenticate("somchai", "password1"))?.fullName).toBe("สมชาย");
});

test("duplicate username rejected", async () => {
  await createUser(admin, input);
  expect(await createUser(admin, input)).toEqual({ ok: false, error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" });
});

test("7-char password rejected", async () => {
  expect(await createUser(admin, { ...input, password: "1234567" })).toEqual({
    ok: false,
    error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
  });
  expect(await prisma.user.count({ where: { username: "somchai" } })).toBe(0);
});

test("invalid username rejected", async () => {
  expect((await createUser(admin, { ...input, username: "Bad Name" })).ok).toBe(false);
  expect((await createUser(admin, { ...input, username: "ab" })).ok).toBe(false);
});

test("non-admin gets forbidden on every operation", async () => {
  const denied = { ok: false, error: "ไม่มีสิทธิ์ดำเนินการ" };
  expect(await createUser(plain, input)).toEqual(denied);
  expect(await updateUser(plain, admin.id, { fullName: "x", systemRole: "USER" })).toEqual(denied);
  expect(await setUserActive(plain, admin.id, false)).toEqual(denied);
  expect(await resetPassword(plain, admin.id, "newpassword")).toEqual(denied);
  expect(await listUsers(plain)).toEqual(denied);
});

test("admin cannot deactivate themself", async () => {
  expect(await setUserActive(admin, admin.id, false)).toEqual({ ok: false, error: "ไม่สามารถปิดบัญชีของตนเองได้" });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true);
});

test("admin can deactivate another user, who can then no longer log in", async () => {
  expect((await setUserActive(admin, plain.id, false)).ok).toBe(true);
  expect(await authenticate("plain", "oldpass123")).toBeNull();
});

test("resetPassword swaps the working password; short password rejected", async () => {
  expect((await resetPassword(admin, plain.id, "short")).ok).toBe(false);
  expect((await resetPassword(admin, plain.id, "brandnew99")).ok).toBe(true);
  expect(await authenticate("plain", "brandnew99")).not.toBeNull();
  expect(await authenticate("plain", "oldpass123")).toBeNull();
});

test("updateUser changes profile fields; admin cannot demote themself", async () => {
  expect((await updateUser(admin, plain.id, { fullName: "New Name", position: "Dev", systemRole: "ADMIN" })).ok).toBe(true);
  expect(await prisma.user.findUniqueOrThrow({ where: { id: plain.id } })).toMatchObject({
    fullName: "New Name",
    position: "Dev",
    systemRole: "ADMIN",
  });
  expect(await updateUser(admin, admin.id, { fullName: "Admin", systemRole: "USER" })).toEqual({
    ok: false,
    error: "ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้",
  });
});

test("listUsers never exposes passwordHash", async () => {
  const r = await listUsers(admin);
  if (!r.ok) throw new Error("expected ok");
  expect(r.data).toHaveLength(2);
  for (const u of r.data) expect(u).not.toHaveProperty("passwordHash");
});
