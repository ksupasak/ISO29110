import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { UserMenu } from "./user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold">ISO/IEC 29110</span>
          <nav className="flex flex-1 items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">โครงการ</Link>
            {user.systemRole === "ADMIN" && (
              <Link href="/admin/users" className="hover:underline">ผู้ใช้งาน</Link>
            )}
          </nav>
          {/* Only the display name crosses to the client; never the full User record. */}
          <UserMenu fullName={user.fullName} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </div>
  );
}
