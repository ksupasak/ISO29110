import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "./setup/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { authenticate, createSession, destroySession, getSessionUser } from "@/lib/auth/session";

beforeEach(resetDb);

test("password round trip", async () => {
  const h = await hashPassword("s3cret!");
  expect(h).not.toContain("s3cret");
  expect(await verifyPassword("s3cret!", h)).toBe(true);
  expect(await verifyPassword("wrong", h)).toBe(false);
});

test("authenticate rejects wrong password, unknown and inactive users", async () => {
  const u = await prisma.user.create({ data: { username: "pm1", fullName: "สมชาย", passwordHash: await hashPassword("pw") } });
  expect((await authenticate("pm1", "pw"))?.id).toBe(u.id);
  expect(await authenticate("pm1", "nope")).toBeNull();
  expect(await authenticate("ghost", "pw")).toBeNull();
  await prisma.user.update({ where: { id: u.id }, data: { active: false } });
  expect(await authenticate("pm1", "pw")).toBeNull();
});

test("session lifecycle; token is not stored in clear", async () => {
  const u = await prisma.user.create({ data: { username: "a", fullName: "A", passwordHash: "x" } });
  const { token } = await createSession(u.id);
  expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
  expect((await getSessionUser(token))?.id).toBe(u.id);
  await destroySession(token);
  expect(await getSessionUser(token)).toBeNull();
  expect(await getSessionUser(undefined)).toBeNull();
});

test("expired session and deactivated user are logged out", async () => {
  const u = await prisma.user.create({ data: { username: "b", fullName: "B", passwordHash: "x" } });
  const s1 = await createSession(u.id);
  await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await getSessionUser(s1.token)).toBeNull();
  const s2 = await createSession(u.id);
  await prisma.user.update({ where: { id: u.id }, data: { active: false } });
  expect(await getSessionUser(s2.token)).toBeNull();
});
