const formatter = new Intl.DateTimeFormat("en-GB-u-ca-buddhist", {
  timeZone: "Asia/Bangkok",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatThaiDate(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = formatter.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("day")}/${get("month")}/${get("year")}`;
}
