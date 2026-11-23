import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth/current-user";

// Placeholder; Task 5 replaces it with the real home page under the (app) route group.
export default async function Home() {
  const user = await requireUser();
  return (
    <main className="flex flex-1 flex-col items-start gap-4 p-6">
      <p>สวัสดี {user.fullName}</p>
      <form action={logoutAction}>
        <button type="submit" className="rounded-md border px-3 py-2">ออกจากระบบ</button>
      </form>
    </main>
  );
}
