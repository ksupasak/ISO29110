import { FILE_TOO_LARGE_MESSAGE, MAX_FILE_BYTES } from "@/lib/upload-limits";

/** The uploaded `file` field, or an error message. Size is checked before the bytes are read into memory. */
export async function readFormFile(formData: FormData): Promise<{ fileName: string; mime: string; data: Buffer } | string> {
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) return "ไฟล์ว่างเปล่า";
  if (f.size > MAX_FILE_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return { fileName: f.name, mime: f.type || "application/octet-stream", data: Buffer.from(await f.arrayBuffer()) };
}
