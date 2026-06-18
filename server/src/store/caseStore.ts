import type { NewCase, StoredCase } from "../domain/caseTypes.js";

/** Optional filters for the saved-cases list (Step 8: all cases, filterable). */
export interface ListFilter {
  /** Only cases where the doctor disagreed with the system's decision. */
  disagreementsOnly?: boolean;
}

/**
 * Persistence boundary. Kept deliberately small and synchronous (better-sqlite3 is sync, the
 * in-memory store is sync). Swapping the backing store touches only an implementation of this.
 */
export interface CaseStore {
  /** Insert a new case; the store assigns the integer id and returns the complete stored record. */
  create(c: NewCase): StoredCase;
  /** Persist changes to an existing case by its known id. */
  update(c: StoredCase): void;
  /** Remove a case permanently. No-op if the id does not exist. */
  delete(id: number): void;
  get(id: number): StoredCase | undefined;
  /** Newest first. */
  list(filter?: ListFilter): StoredCase[];
  count(): number;
}

function matches(c: StoredCase, filter?: ListFilter): boolean {
  if (!filter) return true;
  // Pending cases (no verdict yet) are never "disagreements".
  if (filter.disagreementsOnly && (c.verdict === null || c.verdict.agrees)) return false;
  return true;
}

/** Apply list filtering + newest-first ordering. Shared by store implementations. */
export function selectCases(all: Iterable<StoredCase>, filter?: ListFilter): StoredCase[] {
  return [...all]
    .filter((c) => matches(c, filter))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Simple in-memory store — used in tests and as the reference implementation. */
export class InMemoryCaseStore implements CaseStore {
  private readonly cases = new Map<number, StoredCase>();
  private nextId = 1;

  create(c: NewCase): StoredCase {
    const stored: StoredCase = { ...c, id: this.nextId++ };
    this.cases.set(stored.id, stored);
    return stored;
  }

  update(c: StoredCase): void {
    this.cases.set(c.id, c);
  }

  delete(id: number): void {
    this.cases.delete(id);
  }

  get(id: number): StoredCase | undefined {
    return this.cases.get(id);
  }

  list(filter?: ListFilter): StoredCase[] {
    return selectCases(this.cases.values(), filter);
  }

  count(): number {
    return this.cases.size;
  }
}
