import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

// The part of a D1 binding that the Worker uses, in front of an SQLite database in memory that
// the migration files have built, in the order of their names. The SQL of the Worker runs
// against the real schema.
export const openDatabase = () => {
  const sqlite = new DatabaseSync(":memory:");
  const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql"));
  for (const file of files.sort())
    sqlite.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));

  const binding = {
    prepare: (sql) => {
      const statement = sqlite.prepare(sql);
      return {
        bind: (...values) => ({
          first: async () => statement.get(...values) ?? null,
          all: async () => ({ results: statement.all(...values) }),
          run: async () => ({
            meta: { changes: Number(statement.run(...values).changes) },
          }),
        }),
      };
    },
  };

  return { binding, sqlite };
};
