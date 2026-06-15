import Database from "better-sqlite3";
import type { StoredCase } from "../domain/caseTypes.js";
import { selectCases, type CaseStore, type ListFilter } from "./caseStore.js";

// SQLite-backed store. Each case is one row: the full StoredCase lives losslessly in a JSON
// `data` column (the canonical record), with a few columns lifted out for cheap list filtering.
// This is intentionally NOT imported from the barrel index, so the native dependency is only
// loaded when this store is actually used.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cases (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  system_color  TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'doctor',
  agrees        INTEGER,
  data          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases (created_at);
CREATE INDEX IF NOT EXISTS idx_cases_agrees ON cases (agrees);
`;

export class SqliteCaseStore implements CaseStore {
  private readonly db: Database.Database;

  /** @param filename path to the SQLite file, or ":memory:" for an ephemeral DB. */
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  save(c: StoredCase): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO cases (id, created_at, system_color, source, agrees, data)
         VALUES (@id, @created_at, @system_color, @source, @agrees, @data)`,
      )
      .run({
        id: c.id,
        created_at: c.created_at,
        system_color: c.decision.color,
        source: c.source,
        agrees: c.verdict === null ? null : c.verdict.agrees ? 1 : 0,
        data: JSON.stringify(c),
      });
  }

  get(id: string): StoredCase | undefined {
    const row = this.db.prepare("SELECT data FROM cases WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as StoredCase) : undefined;
  }

  list(filter?: ListFilter): StoredCase[] {
    // Push the cheap predicates into SQL; reuse selectCases for the exact filter+sort semantics
    // so the in-memory and SQLite stores behave identically.
    const where: string[] = [];
    if (filter?.disagreementsOnly) where.push("agrees = 0");
    const sql =
      "SELECT data FROM cases" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all() as { data: string }[];
    const cases = rows.map((r) => JSON.parse(r.data) as StoredCase);
    return selectCases(cases, filter);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM cases").get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
