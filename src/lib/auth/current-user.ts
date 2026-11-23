import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { SESSION_COOKIE, getSessionUser } from "./session";

export async function requireUser(): Promise<User> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(token);
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") notFound();
  return user;
}
