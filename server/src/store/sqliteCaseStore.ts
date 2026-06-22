import Database from "better-sqlite3";
import type { NewCase, StoredCase } from "../domain/caseTypes.js";
import { selectCases, type CaseStore, type ListFilter } from "./caseStore.js";

// SQLite-backed store. Each case is one row: the full StoredCase lives losslessly in a JSON
// `data` column (the canonical record). A few fields are exposed as GENERATED columns derived
// from that JSON, so list filtering/sorting happens in SQL without a second source of truth to
// keep in sync. The integer id lives only in the `id` column and is re-attached on read.
// This is intentionally NOT imported from the barrel index, so the native dependency is only
// loaded when this store is actually used.

const SCHEMA_VERSION = 1;

// Generated columns are VIRTUAL: recomputed on read, materialised only in the indexes below —
// zero per-row storage, which is the right trade at this scale. A `seed_id` column could be
// added the same way later to back the seed-dedup query; not needed today.
const CREATE_TABLE = (table: string) => `
CREATE TABLE IF NOT EXISTS ${table} (
  id            INTEGER PRIMARY KEY,
  data          TEXT NOT NULL,
  created_at    TEXT    GENERATED ALWAYS AS (json_extract(data, '$.created_at'))     VIRTUAL,
  system_color  TEXT    GENERATED ALWAYS AS (json_extract(data, '$.decision.color')) VIRTUAL,
  source        TEXT    GENERATED ALWAYS AS (json_extract(data, '$.source'))         VIRTUAL,
  agrees        INTEGER GENERATED ALWAYS AS (json_extract(data, '$.verdict.agrees')) VIRTUAL
);`;

const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_cases_created_at   ON cases (created_at);
CREATE INDEX IF NOT EXISTS idx_cases_agrees       ON cases (agrees);
CREATE INDEX IF NOT EXISTS idx_cases_system_color ON cases (system_color);
`;

/** The full StoredCase minus the id, which is owned by the `id` column (re-attached on read). */
function serialize(c: NewCase | StoredCase): string {
  const { id: _id, ...rest } = c as StoredCase;
  return JSON.stringify(rest);
}

function hydrate(row: { id: number; data: string }): StoredCase {
  return { ...(JSON.parse(row.data) as Omit<StoredCase, "id">), id: row.id };
}

export class SqliteCaseStore implements CaseStore {
  private readonly db: Database.Database;

  /** @param filename path to the SQLite file, or ":memory:" for an ephemeral DB. */
  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  /**
   * Bring the schema up to the current version. v0 (fresh or legacy) → v1: a fresh DB gets the
   * v1 schema directly; a legacy DB (real lifted columns) is rebuilt into generated columns,
   * copying `id`+`data` verbatim. The whole step runs in one transaction.
   */
  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version >= SCHEMA_VERSION) return;

    this.db.transaction(() => {
      const hasTable = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cases'")
        .get();

      if (hasTable) {
        // Rebuild the legacy table: its `data` already holds the full JSON record.
        this.db.exec(CREATE_TABLE("cases_new"));
        this.db.exec("INSERT INTO cases_new (id, data) SELECT id, data FROM cases;");
        this.db.exec("DROP TABLE cases;");
        this.db.exec("ALTER TABLE cases_new RENAME TO cases;");
      } else {
        this.db.exec(CREATE_TABLE("cases"));
      }
      this.db.exec(CREATE_INDEXES);
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
  }

  create(c: NewCase): StoredCase {
    const info = this.db.prepare("INSERT INTO cases (data) VALUES (?)").run(serialize(c));
    return { ...c, id: Number(info.lastInsertRowid) };
  }

  update(c: StoredCase): void {
    this.db.prepare("UPDATE cases SET data = ? WHERE id = ?").run(serialize(c), c.id);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM cases WHERE id = ?").run(id);
  }

  get(id: number): StoredCase | undefined {
    const row = this.db.prepare("SELECT id, data FROM cases WHERE id = ?").get(id) as
      | { id: number; data: string }
      | undefined;
    return row ? hydrate(row) : undefined;
  }

  list(filter?: ListFilter): StoredCase[] {
    // Push the cheap predicate into SQL; reuse selectCases for the exact filter+sort semantics
    // so the in-memory and SQLite stores behave identically.
    const where: string[] = [];
    if (filter?.disagreementsOnly) where.push("agrees = 0");
    const sql =
      "SELECT id, data FROM cases" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY created_at DESC";
    const rows = this.db.prepare(sql).all() as { id: number; data: string }[];
    return selectCases(rows.map(hydrate), filter);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM cases").get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
