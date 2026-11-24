import type { Prisma } from "@prisma/client";

export type SeqPrefix = "M" | "T" | "AG" | "REQ-F" | "REQ-N" | "C" | "MR";

function pad(no: number, width: number): string {
  return String(no).padStart(width, "0");
}

/** M1, T-001, AG-01, REQ-F01, REQ-N01, C01, MR-2569-01. */
export function formatCode(prefix: SeqPrefix, no: number, buddhistYear?: number): string {
  switch (prefix) {
    case "M":
      return `M${no}`;
    case "T":
      return `T-${pad(no, 3)}`;
    case "AG":
      return `AG-${pad(no, 2)}`;
    case "REQ-F":
    case "REQ-N":
      return `${prefix}${pad(no, 2)}`;
    case "C":
      return `C${pad(no, 2)}`;
    case "MR":
      return `MR-${buddhistYear ?? 0}-${pad(no, 2)}`;
  }
}

/**
 * Issue the next code. Must be called with the transaction client of the insert so the
 * number is only consumed if the row is created. The upsert takes a row lock on the
 * counter, so concurrent callers are serialised and never get the same number. Counters
 * only go up: deleting a row never frees its number.
 */
export async function nextCode(
  tx: Prisma.TransactionClient,
  projectId: string,
  prefix: SeqPrefix,
  buddhistYear?: number,
): Promise<string> {
  const year = buddhistYear ?? 0;
  const row = await tx.docSequence.upsert({
    where: { projectId_prefix_year: { projectId, prefix, year } },
    create: { projectId, prefix, year, lastNo: 1 },
    update: { lastNo: { increment: 1 } },
    select: { lastNo: true },
  });
  return formatCode(prefix, row.lastNo, buddhistYear);
}
