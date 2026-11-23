import { requireAdmin } from "@/lib/auth/current-user";
import { listUsers } from "@/features/users/service";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveToggle, CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "./user-dialogs";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const result = await listUsers(admin);
  const users = result.ok ? result.data : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ผู้ใช้งาน</h1>
        <CreateUserDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อผู้ใช้</TableHead>
            <TableHead>ชื่อ-นามสกุล</TableHead>
            <TableHead>ตำแหน่ง</TableHead>
            <TableHead>สิทธิ์ระบบ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.username}</TableCell>
              <TableCell>{u.fullName}</TableCell>
              <TableCell>{u.position ?? ""}</TableCell>
              <TableCell>{u.systemRole === "ADMIN" ? "ผู้ดูแลระบบ" : "ผู้ใช้ทั่วไป"}</TableCell>
              <TableCell>
                <Badge variant={u.active ? "secondary" : "outline"}>{u.active ? "ใช้งาน" : "ปิดใช้งาน"}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <EditUserDialog user={u} />
                <ResetPasswordDialog userId={u.id} username={u.username} />
                <ActiveToggle userId={u.id} active={u.active} isSelf={u.id === admin.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
