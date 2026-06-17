import Database from "better-sqlite3";
const db = new Database(process.env.DB_PATH ?? "cases.db");
const rows = db
  .prepare(
    `SELECT id, created_at,
       json_extract(data, '$.seed_id') as seed_id,
       json_extract(data, '$.decision.color') as color,
       json_extract(data, '$.extraction.ok') as extraction_ok
     FROM cases
     WHERE json_extract(data, '$.seed_id') IS NOT NULL
     ORDER BY created_at ASC`,
  )
  .all() as { id: string; created_at: string; seed_id: string; color: string; extraction_ok: number | null }[];
console.log(`Seeded cases in DB (${rows.length}):`);
rows.forEach((r, i) =>
  console.log(`  ${String(i + 1).padStart(2)}. ${r.seed_id.padEnd(30)} ${r.color.padEnd(6)} ok=${r.extraction_ok} ${r.created_at}`),
);
db.close();
