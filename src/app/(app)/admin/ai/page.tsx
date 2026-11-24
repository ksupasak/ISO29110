import { requireAdmin } from "@/lib/auth/current-user";
import { hasSecret } from "@/lib/secret-box";
import { getAiSettingsView } from "@/features/ai/settings";
import { AppCard } from "@/components/app-card";
import { PageHeader } from "@/components/page-header";
import { AiSettingsForm } from "./ai-settings-form";

export default async function AiSettingsPage() {
  await requireAdmin();
  const view = await getAiSettingsView();
  return (
    <>
      <PageHeader title="ตั้งค่า AI" />
      <AppCard title="Model ที่ระบบใช้" icon="smart_toy">
        <div className="card-body">
          <AiSettingsForm view={view} secretReady={hasSecret()} />
        </div>
      </AppCard>
    </>
  );
}
