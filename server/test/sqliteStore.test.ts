import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuleSet } from "../src/engine/index.js";
import { assembleCase } from "../src/domain/derive.js";
import type { Verdict } from "../src/domain/caseTypes.js";
import type { CaseStore } from "../src/store/caseStore.js";
import type DatabaseT from "better-sqlite3";

// better-sqlite3 is a native module; in some environments its binary may not be built.
// Import dynamically and skip (rather than fail) when it isn't available, so the rest of the
// suite stays green. On a normal dev machine this runs for real.
let SqliteCaseStore: (new (filename: string) => CaseStore & { close(): void }) | undefined;
let DatabaseCtor: typeof DatabaseT | undefined;
try {
  ({ SqliteCaseStore } = await import("../src/store/sqliteCaseStore.js"));
  DatabaseCtor = (await import("better-sqlite3")).default;
} catch {
  SqliteCaseStore = undefined;
}

const rules = loadRuleSet();

function makeCase(spo2: number, verdict: Verdict | null, at: string) {
  return assembleCase({
    entered: {
      age: { value: 5, unit: "years" },
      complaint_category: "breathing",
      vitals: { spo2 },
      discriminators: { on_oxygen: "absent" },
    },
    verdict,
    ruleSet: rules,
    now: new Date(at),
  });
}

function makeNew(spo2: number, agrees: boolean, at: string) {
  return makeCase(spo2, { agrees }, at);
}

/** A unique on-disk DB path. In-memory DBs can't be inspected from a second connection. */
function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "triage-store-"));
  return { path: join(dir, "cases.db"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe.skipIf(!SqliteCaseStore)("SqliteCaseStore (native better-sqlite3)", () => {
  it("round-trips a case through an in-memory database", () => {
    const store = new SqliteCaseStore!(":memory:");
    const c = store.create(makeNew(80, true, "2026-06-09T09:00:00Z")); // system RED, doctor agrees

    expect(store.count()).toBe(1);
    const got = store.get(c.id);
    expect(got?.id).toBe(c.id);
    expect(typeof got?.id).toBe("number");
    expect(got?.decision.color).toBe("RED");
    expect(got?.decision.all_fired_rules.map((f) => f.name)).toContain("severe_hypoxia");
    store.close();
  });

  it("lists newest-first and filters disagreements like the in-memory store", () => {
    const store = new SqliteCaseStore!(":memory:");
    const a = store.create(makeNew(99, true, "2026-06-09T09:00:00Z")); // agrees
    const b = store.create(makeNew(80, false, "2026-06-09T10:00:00Z")); // disagrees

    expect(store.list().map((c) => c.id)).toEqual([b.id, a.id]);
    expect(store.list({ disagreementsOnly: true }).map((c) => c.id)).toEqual([b.id]);
    store.close();
  });

  it("update preserves the id and overwrites other fields", () => {
    const store = new SqliteCaseStore!(":memory:");
    const original = store.create(makeNew(80, true, "2026-06-09T09:00:00Z"));
    store.update({ ...original, verdict: { agrees: false } });
    expect(store.count()).toBe(1);
    expect(store.get(original.id)?.verdict?.agrees).toBe(false);
    expect(store.get(original.id)?.id).toBe(original.id);
    store.close();
  });

  it("assign sequential integer ids starting at 1", () => {
    const store = new SqliteCaseStore!(":memory:");
    const first = store.create(makeNew(99, true, "2026-06-09T09:00:00Z"));
    const second = store.create(makeNew(99, true, "2026-06-09T10:00:00Z"));
    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    store.close();
  });
});

describe.skipIf(!SqliteCaseStore)("SqliteCaseStore generated columns + migration", () => {
  it("derives created_at / system_color / agrees from the JSON, and keeps id out of data", () => {
    const { path, cleanup } = tmpDb();
    const store = new SqliteCaseStore!(path);
    store.create(makeNew(80, false, "2026-06-09T09:00:00Z")); // RED, disagrees -> agrees 0
    store.create(makeNew(99, true, "2026-06-09T10:00:00Z")); //  not RED, agrees -> agrees 1
    store.create(makeCase(95, null, "2026-06-09T11:00:00Z")); // pending -> agrees NULL
    store.close();

    const raw = new DatabaseCtor!(path);
    const rows = raw
      .prepare("SELECT id, system_color, agrees, created_at, data FROM cases ORDER BY id")
      .all() as { id: number; system_color: string; agrees: number | null; created_at: string; data: string }[];
    raw.close();
    cleanup();

    expect(rows[0]!.system_color).toBe("RED");
    expect(rows[0]!.agrees).toBe(0);
    expect(rows[0]!.created_at).toBe("2026-06-09T09:00:00.000Z");
    expect(rows[1]!.agrees).toBe(1);
    expect(rows[2]!.agrees).toBeNull(); // pending verdict
    // id is owned by the column, never duplicated into the JSON blob.
    expect(JSON.parse(rows[0]!.data)).not.toHaveProperty("id");
  });

  it("recomputes generated columns when the JSON is updated", () => {
    const { path, cleanup } = tmpDb();
    const store = new SqliteCaseStore!(path);
    const c = store.create(makeNew(80, true, "2026-06-09T09:00:00Z")); // agrees -> 1
    store.update({ ...c, verdict: { agrees: false } }); // flip to disagree
    store.close();

    const raw = new DatabaseCtor!(path);
    const row = raw.prepare("SELECT agrees FROM cases WHERE id = ?").get(c.id) as { agrees: number };
    raw.close();
    cleanup();

    expect(row.agrees).toBe(0);
  });

  it("migrates a legacy real-column DB to the v1 generated-column schema", () => {
    const { path, cleanup } = tmpDb();

    // Build the OLD schema by hand and insert one row the old way (id embedded in data,
    // lifted columns hand-written, user_version left at 0).
    const legacy = new DatabaseCtor!(path);
    legacy.exec(`CREATE TABLE cases (
      id            INTEGER PRIMARY KEY,
      created_at    TEXT NOT NULL,
      system_color  TEXT NOT NULL,
      source        TEXT NOT NULL DEFAULT 'doctor',
      agrees        INTEGER,
      data          TEXT NOT NULL
    );`);
    const legacyCase = { ...makeNew(80, false, "2026-06-09T09:00:00Z"), id: 7 };
    legacy
      .prepare(
        `INSERT INTO cases (id, created_at, system_color, source, agrees, data)
         VALUES (@id, @created_at, @system_color, @source, @agrees, @data)`,
      )
      .run({
        id: 7,
        created_at: legacyCase.created_at,
        system_color: legacyCase.decision.color,
        source: legacyCase.source,
        agrees: 0,
        data: JSON.stringify(legacyCase),
      });
    legacy.close();

    // Opening through the store should migrate in place.
    const store = new SqliteCaseStore!(path);
    const got = store.get(7);
    expect(got?.id).toBe(7);
    expect(got?.decision.color).toBe("RED");
    expect(store.list({ disagreementsOnly: true }).map((c) => c.id)).toEqual([7]);
    store.close();

    const raw = new DatabaseCtor!(path);
    const version = raw.pragma("user_version", { simple: true }) as number;
    const row = raw.prepare("SELECT agrees, system_color FROM cases WHERE id = 7").get() as {
      agrees: number;
      system_color: string;
    };
    raw.close();
    cleanup();

    expect(version).toBe(1);
    expect(row.agrees).toBe(0); // generated column recomputed from the migrated JSON
    expect(row.system_color).toBe("RED");
  });
});
