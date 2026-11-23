"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">เกิดข้อผิดพลาด</h1>
      <Button onClick={() => retry()}>ลองอีกครั้ง</Button>
    </main>
  );
}
