"use client";

import { Icon } from "@/components/icon";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="status-page">
      <div className="card">
        <div className="card-body p-4 p-sm-5 text-center">
          <span className="status-page-icon text-danger bg-danger-subtle">
            <Icon name="error" />
          </span>
          <h1 className="h4 mb-4">เกิดข้อผิดพลาด</h1>
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            <Icon name="refresh" />
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    </main>
  );
}
