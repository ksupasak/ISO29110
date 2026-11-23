import { requireUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // Only the display name and admin flag cross to the client; never the full User record.
  return <AppShell user={{ fullName: user.fullName, isAdmin: user.systemRole === "ADMIN" }}>{children}</AppShell>;
}
