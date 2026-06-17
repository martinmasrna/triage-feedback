import { describe, expect, it } from "vitest";
import { loadRuleSet } from "../src/engine/index.js";
import { assembleCase } from "../src/domain/derive.js";
import type { CaseStore } from "../src/store/caseStore.js";

// better-sqlite3 is a native module; in some environments its binary may not be built.
// Import dynamically and skip (rather than fail) when it isn't available, so the rest of the
// suite stays green. On a normal dev machine this runs for real.
let SqliteCaseStore: (new (filename: string) => CaseStore & { close(): void }) | undefined;
try {
  ({ SqliteCaseStore } = await import("../src/store/sqliteCaseStore.js"));
} catch {
  SqliteCaseStore = undefined;
}

const rules = loadRuleSet();

function makeNew(spo2: number, agrees: boolean, at: string) {
  return assembleCase({
    entered: {
      age: { value: 5, unit: "years" },
      complaint_category: "breathing",
      vitals: { spo2 },
      discriminators: { on_oxygen: "absent" },
    },
    verdict: { agrees },
    ruleSet: rules,
    now: new Date(at),
  });
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
    expect(got?.decision.fired.map((f) => f.name)).toContain("severe_hypoxia");
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
