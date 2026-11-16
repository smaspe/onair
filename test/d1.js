import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATION = new URL("../migrations/0001_progress.sql", import.meta.url);

// The part of a D1 binding that the Worker uses, in front of an SQLite database in memory that
// the migration file has built. The SQL of the Worker runs against the real schema.
export const openDatabase = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(MIGRATION, "utf8"));

  const binding = {
    prepare: (sql) => ({
      bind: (...values) => ({
        first: async () => sqlite.prepare(sql).get(...values) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
        run: async () => ({
          meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
        }),
      }),
    }),
  };

  return { binding, sqlite };
};
