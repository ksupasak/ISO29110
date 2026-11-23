import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <main className="status-page">
      <div className="card">
        <div className="card-body p-4 p-sm-5 text-center">
          <span className="status-page-icon">
            <Icon name="search_off" />
          </span>
          <h1 className="h4">ไม่พบหน้าที่ต้องการ</h1>
          <p className="text-body-secondary mb-4">หน้านี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
          <Link href="/" className="btn btn-primary">
            <Icon name="home" />
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    </main>
  );
}
