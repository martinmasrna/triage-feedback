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

function sampleCase(id: string, spo2: number, agrees: boolean, at: string) {
  return assembleCase({
    entered: {
      age: { value: 5, unit: "years" },
      complaint_category: "breathing",
      vitals: { spo2 },
      discriminators: { on_oxygen: "absent" },
    },
    verdict: { agrees },
    ruleSet: rules,
    id,
    now: new Date(at),
  });
}

describe.skipIf(!SqliteCaseStore)("SqliteCaseStore (native better-sqlite3)", () => {
  it("round-trips a case through an in-memory database", () => {
    const store = new SqliteCaseStore!(":memory:");
    const c = sampleCase("a", 80, true, "2026-06-09T09:00:00Z"); // system RED, doctor agrees
    store.save(c);

    expect(store.count()).toBe(1);
    const got = store.get("a");
    expect(got?.id).toBe("a");
    expect(got?.decision.color).toBe("RED");
    expect(got?.decision.fired.map((f) => f.name)).toContain("severe_hypoxia");
    store.close();
  });

  it("lists newest-first and filters disagreements like the in-memory store", () => {
    const store = new SqliteCaseStore!(":memory:");
    store.save(sampleCase("a", 99, true, "2026-06-09T09:00:00Z")); // agrees
    store.save(sampleCase("b", 80, false, "2026-06-09T10:00:00Z")); // disagrees

    expect(store.list().map((c) => c.id)).toEqual(["b", "a"]);
    expect(store.list({ disagreementsOnly: true }).map((c) => c.id)).toEqual(["b"]);
    store.close();
  });

  it("INSERT OR REPLACE upserts by id", () => {
    const store = new SqliteCaseStore!(":memory:");
    store.save(sampleCase("a", 80, true, "2026-06-09T09:00:00Z"));
    store.save(sampleCase("a", 99, false, "2026-06-09T09:00:00Z")); // same id, replaces
    expect(store.count()).toBe(1);
    expect(store.get("a")?.decision.color).toBe("GREEN");
    store.close();
  });
});
