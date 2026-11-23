import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/features/users/service";
import { AppCard } from "@/components/app-card";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-badge";
import { ActiveToggle, CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "./user-dialogs";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const result = await listUsers(admin);
  const users = result.ok ? result.data : [];
  return (
    <>
      <PageHeader title="ผู้ใช้งาน">
        <CreateUserDialog />
      </PageHeader>
      <AppCard>
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">ชื่อผู้ใช้</th>
                <th scope="col">ชื่อ-นามสกุล</th>
                <th scope="col" className="d-none d-md-table-cell">ตำแหน่ง</th>
                <th scope="col" className="d-none d-md-table-cell">สิทธิ์ระบบ</th>
                <th scope="col">สถานะ</th>
                <th scope="col" className="text-end table-actions">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="fw-medium text-nowrap">{u.username}</td>
                  <td className="text-nowrap">{u.fullName}</td>
                  <td className="d-none d-md-table-cell">{u.position ?? ""}</td>
                  <td className="d-none d-md-table-cell">{u.systemRole === "ADMIN" ? "ผู้ดูแลระบบ" : "ผู้ใช้ทั่วไป"}</td>
                  <td>
                    <StatusChip variant={u.active ? "success" : "secondary"}>{u.active ? "ใช้งาน" : "ปิดใช้งาน"}</StatusChip>
                  </td>
                  <td className="text-end table-actions">
                    <EditUserDialog user={u} />
                    <ResetPasswordDialog userId={u.id} username={u.username} />
                    <ActiveToggle userId={u.id} active={u.active} isSelf={u.id === admin.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>
    </>
  );
}
