/**
 * Logical (INSERT-based) database backup.
 *
 * Turso's free tier has no point-in-time recovery, so a scheduled logical dump
 * is the safety net against accidental data loss. This produces a portable
 * `.sql` file of every user table's rows that can be replayed into a fresh
 * libSQL/SQLite database (schema is recreated by `runMigrations()` first).
 *
 * Run:  npm run backup > backups/lumo-$(date +%F).sql
 * See:  docs/ops/database-backup.md
 */
import { query } from "./client.js";

/** Serialize one value as a SQL literal for an INSERT statement. */
export function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array) {
    // BLOB → X'hex'
    let hex = "";
    for (const b of v) hex += b.toString(16).padStart(2, "0");
    return `X'${hex}'`;
  }
  // string (and anything else) → single-quoted, embedded quotes doubled
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build one INSERT statement per row for a table (quoted identifiers). */
export function rowsToInserts(table: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  return rows.map((row) => {
    const cols = Object.keys(row);
    const colList = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
    const valList = cols.map((c) => sqlValue(row[c])).join(", ");
    return `INSERT INTO "${table.replace(/"/g, '""')}" (${colList}) VALUES (${valList});`;
  });
}

// Internal SQLite bookkeeping tables are recreated by the schema, never dumped.
const SKIP_TABLES = new Set(["sqlite_sequence"]);

/** Produce a full logical dump of all user tables as a single SQL string. */
export async function dumpDatabase(): Promise<string> {
  const tables = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name",
  );

  const out: string[] = [
    "-- Lumo logical backup (INSERT dump)",
    "-- Restore order: run migrations to create the schema, then replay this file.",
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];

  let totalRows = 0;
  for (const { name } of tables) {
    if (SKIP_TABLES.has(name)) continue;
    const rows = await query<Record<string, unknown>>(`SELECT * FROM "${name}"`);
    totalRows += rows.length;
    out.push(`-- table ${name}: ${rows.length} rows`);
    out.push(...rowsToInserts(name, rows));
  }

  out.push("COMMIT;");
  out.push(`-- end of backup — ${tables.length} tables, ${totalRows} rows`);
  return out.join("\n") + "\n";
}

// CLI entrypoint: `tsx src/db/backup.ts` writes the dump to stdout.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  dumpDatabase()
    .then((sql) => {
      process.stdout.write(sql);
      process.exit(0);
    })
    .catch((err) => {
      console.error("backup failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
