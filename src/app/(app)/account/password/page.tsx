import { requireUser } from "@/lib/auth/current-user";
import { AppCard } from "@/components/app-card";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "./password-form";

export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="เปลี่ยนรหัสผ่าน" />
      <AppCard title="รหัสผ่านของฉัน" icon="key">
        <div className="card-body">
          <PasswordForm />
        </div>
      </AppCard>
    </>
  );
}
