import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "esm_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Hash compared against when the username is unknown, so response time does not reveal which usernames exist.
const DUMMY_HASH = "$2b$10$S8TpqXwWobDMhJ1TkXWBe.aEwr1ZHzz4aH5gwtiEwvTi.z3mWEDiK";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.active) return null;
  return session.user;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok && user.active ? user : null;
}
