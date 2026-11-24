/** Helpers for reading values out of FormData. Empty strings become null/undefined. */
export function formText(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** `<input type="date">` value (YYYY-MM-DD) to a Date at UTC midnight; null when empty or malformed. */
export function formDate(formData: FormData, key: string): Date | null {
  const v = formText(formData, key).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formNumber(formData: FormData, key: string): number | null {
  const v = formText(formData, key).trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** State returned by form server actions; `values` echoes the submitted fields so a dialog can repopulate after an error. */
export type FormState = { error?: string; ok?: boolean; values?: Record<string, string> };

/** All form fields as strings, for echoing back after an error. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
