import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MIN_SECRET_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** The public example value in .env.example; a copied-unchanged .env must not encrypt with it. */
export const PLACEHOLDER_SECRET = "change-me-settings-secret-min-16-chars";

/** True when env SETTINGS_SECRET is set, long enough, and not the .env.example placeholder. */
export function hasSecret(): boolean {
  const secret = process.env.SETTINGS_SECRET ?? "";
  return secret.length >= MIN_SECRET_LENGTH && secret !== PLACEHOLDER_SECRET;
}

function key(): Buffer {
  return createHash("sha256").update(process.env.SETTINGS_SECRET ?? "").digest();
}

/** AES-256-GCM. Output is base64(iv | tag | ciphertext). Throws when there is no usable secret. */
export function seal(plain: string): string {
  if (!hasSecret()) throw new Error("SETTINGS_SECRET is not set or is shorter than 16 characters");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** The plain text, or null when the value is malformed, tampered with, or sealed under another secret. */
export function open(sealed: string): string | null {
  if (!hasSecret()) return null;
  try {
    const buf = Buffer.from(sealed, "base64");
    if (buf.length < IV_LENGTH + TAG_LENGTH) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, IV_LENGTH));
    decipher.setAuthTag(buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([decipher.update(buf.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
