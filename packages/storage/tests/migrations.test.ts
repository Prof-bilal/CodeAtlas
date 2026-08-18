import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContextStore } from "../src/context-store";
import { openDatabase } from "../src/db";
import { type Migration, runMigrations } from "../src/migrations";

describe("migrations", () => {
  it("applies the built-in schema and reports the version", () => {
    const store = new ContextStore({ filePath: ":memory:" });
    expect(store.version).toBe(1);
    store.close();
  });

  it("does not re-run migrations when the database is reopened", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-storage-"));
    try {
      const dbPath = join(dir, "context.db");
      const first = new ContextStore({ filePath: dbPath });
      expect(first.version).toBe(1);
      first.close();

      const second = new ContextStore({ filePath: dbPath });
      expect(second.version).toBe(1);
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies only pending migrations and is idempotent", () => {
    const db = openDatabase(":memory:");
    const custom: Migration[] = [
      { version: 1, name: "one", up: (handle) => handle.exec("CREATE TABLE t1 (id INTEGER);") },
      { version: 2, name: "two", up: (handle) => handle.exec("CREATE TABLE t2 (id INTEGER);") },
    ];
    runMigrations(db, custom);
    runMigrations(db, custom); // already applied → no-op, no error
    expect(db.prepare("SELECT id FROM t2 LIMIT 1").all()).toEqual([]);
    db.close();
  });
});
