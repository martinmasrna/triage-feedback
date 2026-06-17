# Refactor: UUID → sequential integer case IDs

## Goal
Replace the current `randomUUID()` string IDs with SQLite auto-increment integers.
Display becomes "Prípad č. 47" instead of "Prípad č. 8c5c59".

## Why
- UUID is solving a distributed-systems problem this app doesn't have (one DB, one writer).
- `INTEGER PRIMARY KEY` in SQLite *is* the rowid — the fastest possible lookup, no separate index.
- `INSERT OR REPLACE` (currently used for both create and update) is semantically wrong for updates:
  it deletes and reinserts, which would assign a new integer on every verdict edit. So this refactor
  also fixes the underlying store design.
- Eliminates the redundancy of storing the ID both as a column and inside the JSON blob.

---

## Concept-level changes

### 1. Split `save()` into `create()` + `update()` (store interface)
The core design change. Currently `CaseStore.save()` does both. With auto-increment:
- `create(c)` — INSERTs a new row, lets SQLite assign the id, returns the full case with the real id.
- `update(c)` — UPDATEs an existing row by its known integer id. Does not change the id.
- `get(id)` — changes from `get(id: string)` to `get(id: number)`.
- Apply the same split to `InMemoryCaseStore` (use a counter starting at 1).

### 2. `StoredCase.id` becomes `number`
Change in `server/src/domain/caseTypes.ts`. Also add a `NewCase = Omit<StoredCase, 'id'>` type
for cases that haven't been persisted yet (no id assigned).

### 3. `assembleCase()` returns `NewCase`, not `StoredCase`
In `server/src/domain/derive.ts`:
- Remove the `id?` and `now?` injectable params from `AssembleArgs` (id is now DB-assigned;
  `now` can stay for test determinism if desired, but `id` must go).
- Remove the `randomUUID` import.
- Return type changes to `NewCase` (i.e. `Omit<StoredCase, 'id'>`).

### 4. Update all call sites in `app.ts`
- `POST /api/cases`: call `store.create(newCase)` (not save), use the returned case (which has the
  real integer id) for the response.
- `POST /api/cases/:id/verdict` and `PATCH /api/cases/:id`: call `store.update(updated)`.
- Parse route params as integers: `Number(c.req.param("id"))` instead of bare string.
- `GET /api/cases/:id` and `GET /api/admin/cases/:id`: same — parse param as integer.

### 5. Update `seed-cases.ts`
Uses `store.save(stored)` and then mutates `stored.seed_id`. Change to:
`const stored = store.create({ ...newCase, seed_id: seed.id })`.

### 6. SQLite schema change
`id TEXT PRIMARY KEY` → `id INTEGER PRIMARY KEY`.
On `create()`: INSERT without an id column, then read `lastInsertRowid` (a bigint in
better-sqlite3 — call `.toString()` or cast to number), embed it in the JSON blob, and return the
complete `StoredCase`.
On `update()`: `UPDATE cases SET ... WHERE id = ?` — a proper update, no delete-reinsert.

### 7. Web types and router
- `web/src/types.ts`: `id: string` → `id: number` in both `DoctorCase` and `StoredCase`.
- `web/src/api.ts`: `get(id: number)` and `adminGet(id: number)` (fetch URL interpolation works
  fine with numbers).
- `web/src/router.ts`: For the two detail routes, change `props: true` to
  `props: route => ({ id: Number(route.params.id) })` so the string URL param is converted before
  reaching the component.
- Detail view `defineProps`: `{ id: string }` → `{ id: number }` in both `CaseDetailView.vue`
  and `AdminCaseDetailView.vue`.

### 8. Display fix
In `CaseDetailView.vue`, replace `c.id.slice(0, 6)` with just `c.id` everywhere.
Same in `AdminCaseDetailView.vue` if the full UUID was shown there.

---

## Test changes
The test suite uses `assembleCase()` with `id: "some-string"` for deterministic IDs, and
`store.save()` / `store.get("a")` with string keys. These all need updating:

- `caseRecord.test.ts`: Remove `id:` from `assembleCase()` calls. The store now assigns ids, so
  tests that need a specific case should `store.create()` and capture the returned id.
- `sqliteStore.test.ts`: Rewrite around `create()` / `update()`. The "INSERT OR REPLACE upserts"
  test no longer applies — replace it with a test that `update()` preserves the id.
- `api.test.ts`:
  - The `/api/seeds` describe block tests an endpoint that no longer exists — delete it.
  - The `POST /api/cases/:id/verdict` tests currently call `store.save(assembleCase({..., id: "pending-1"}))`.
    Change to `store.create(assembleCase({...}))` and capture the returned numeric id.
  - The `patch()` helper uses a string id — change to number.
  - `store.get(saved.id)` works fine once `id` is a number throughout.

---

## Key invariant to preserve
The `seed_id` field on `StoredCase` (a YAML slug string like `"infant-fever-lethargy"`) is
completely separate from the integer `id`. `seed_id` is used only for seeding idempotency.
Do not confuse the two.
