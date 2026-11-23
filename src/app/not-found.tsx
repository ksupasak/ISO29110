import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">ไม่พบหน้าที่ต้องการ</h1>
      <p className="text-sm text-muted-foreground">หน้านี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
      <Link href="/" className="text-sm underline">กลับหน้าหลัก</Link>
    </main>
  );
}
