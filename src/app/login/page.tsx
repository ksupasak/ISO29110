import { Icon } from "@/components/icon";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="status-page">
      <div className="card">
        <div className="card-header card-header-primary flex-column align-items-start gap-3 px-4 py-4">
          <span className="card-header-icon">
            <Icon name="verified" />
          </span>
          <div>
            <div className="small opacity-75 fw-medium">ESM Project</div>
            <h1 className="h4 mb-0 text-white">ระบบบริหารโครงการ ISO/IEC 29110</h1>
          </div>
        </div>
        <div className="card-body p-4">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
