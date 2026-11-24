import { hasSecret, open, seal } from "@/lib/secret-box";

const ORIGINAL = process.env.SETTINGS_SECRET;
const SECRET = "unit-test-secret-0123456789";

beforeEach(() => {
  process.env.SETTINGS_SECRET = SECRET;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SETTINGS_SECRET;
  else process.env.SETTINGS_SECRET = ORIGINAL;
});

describe("secret-box", () => {
  test("round-trips ASCII and Thai text", () => {
    for (const text of ["sk-ant-abc123", "รหัสลับ ภาษาไทย ๑๒๓", ""]) {
      expect(open(seal(text))).toBe(text);
    }
  });

  test("two seals of the same text differ and hide the plain text", () => {
    const a = seal("sk-ant-abc123");
    const b = seal("sk-ant-abc123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("abc123");
  });

  test("tampered text opens as null", () => {
    const sealed = seal("sk-ant-abc123");
    const buf = Buffer.from(sealed, "base64");
    buf[buf.length - 1] ^= 1;
    expect(open(buf.toString("base64"))).toBeNull();
    expect(open("not-a-sealed-value")).toBeNull();
    expect(open("")).toBeNull();
  });

  test("a different SETTINGS_SECRET opens as null", () => {
    const sealed = seal("sk-ant-abc123");
    process.env.SETTINGS_SECRET = "another-secret-0123456789";
    expect(open(sealed)).toBeNull();
  });

  test("seal throws when the secret is unset or shorter than 16 chars", () => {
    delete process.env.SETTINGS_SECRET;
    expect(hasSecret()).toBe(false);
    expect(() => seal("x")).toThrow();
    process.env.SETTINGS_SECRET = "short-15-chars!";
    expect(hasSecret()).toBe(false);
    expect(() => seal("x")).toThrow();
    process.env.SETTINGS_SECRET = "exactly-16-chars";
    expect(hasSecret()).toBe(true);
  });

  test("open returns null when the secret is unset", () => {
    const sealed = seal("x");
    delete process.env.SETTINGS_SECRET;
    expect(open(sealed)).toBeNull();
  });
});
