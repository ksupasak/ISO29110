import { describe, expect, test } from "vitest";
import { assertTestDatabaseUrl, assertTestStorageDir } from "./setup/db";

describe("resetDb guards", () => {
  test("only a database whose name ends with _test is accepted", () => {
    expect(() => assertTestDatabaseUrl("postgresql://esm:esm@localhost:5432/esm_test")).not.toThrow();
    expect(() => assertTestDatabaseUrl("postgresql://esm:esm@localhost:5432/esm_test?schema=public")).not.toThrow();
    expect(() => assertTestDatabaseUrl("postgresql://esm:esm@localhost:5432/esm")).toThrow(/_test/);
    expect(() => assertTestDatabaseUrl("postgresql://esm:esm@localhost:5432/esm_test_backup")).toThrow(/_test/);
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/_test/);
    expect(() => assertTestDatabaseUrl("not a url")).toThrow(/_test/);
  });

  test("only a directory named test-storage is accepted", () => {
    expect(() => assertTestStorageDir("./test-storage")).not.toThrow();
    expect(() => assertTestStorageDir("/tmp/x/test-storage")).not.toThrow();
    expect(() => assertTestStorageDir("./storage")).toThrow(/test-storage/);
    expect(() => assertTestStorageDir("/data/files")).toThrow(/test-storage/);
    expect(() => assertTestStorageDir("/")).toThrow(/test-storage/);
  });
});
