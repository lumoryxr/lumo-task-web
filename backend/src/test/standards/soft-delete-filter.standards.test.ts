/**
 * Standards · soft-delete read filter (ADR-0003 AC-10)
 *
 * Source-scan guard: every SELECT that reads a soft-deletable table must filter
 * `deleted_at IS NULL` within the same SQL string literal. Missing the filter on
 * even one read path leaks deleted rows to the client (and resurrects them on
 * sync). This catches a forgotten filter on a NEW read added in the future.
 *
 * Soundness: a naive quote-matching regex desyncs on the many single-quoted SQL
 * tokens ('Q1', 'localtime', '[]') and apostrophes in comments, merging literals
 * so an unrelated `deleted_at IS NULL` masks an unfiltered read. We instead use a
 * proper state-machine tokenizer that strips comments and pairs quotes per JS
 * string rules, then check each literal in isolation. (The only dynamically-built
 * read — the tasks list — keeps its `deleted_at IS NULL` inside the base literal
 * precisely so this static check stays sound.)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOFT_TABLES = ["tasks", "completed_entries", "people", "habits", "countdown_events"];
const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Excluded from the client-read scan:
//  - test/ : the test tree.
//  - lib/sync.ts : legacy single-tenant sync, intentionally unfiltered and
//    slated for deletion (ADR-0003 Phase 5).
//  - db/ : the DB layer — generic query helpers (no soft-table SELECTs) and
//    migrations (one-time internal backfills that run before `deleted_at` exists
//    and operate on raw rows; not a client-facing read path).
const EXCLUDE = [
  path.join(SRC_DIR, "test"),
  path.join(SRC_DIR, "db"),
  path.join(SRC_DIR, "lib", "sync.ts"),
];

// A literal-table scan is blind to interpolated table names (`FROM ${tbl}`), so
// an interpolated read of a soft-deletable table could slip an unfiltered read
// past the guard. We therefore FLAG any interpolated `FROM ${...}` in a SELECT
// unless its file is explicitly allowlisted as intentionally reading tombstones.
// These deliberately read tombstones (ADR-0003): routes/sync.ts (delta-pull
// returns deleted rows so deletions propagate) and lib/gc.ts (prunes tombstones).
// sync/engine.ts: the generic pull engine reads `FROM ${entity.table}` and
// intentionally returns tombstoned rows (deletes must propagate to peers), so it
// deliberately omits the `deleted_at IS NULL` filter — allowlisted here.
const DYNAMIC_FROM_ALLOWLIST = [
  path.join(SRC_DIR, "routes", "sync.ts"),
  path.join(SRC_DIR, "lib", "gc.ts"),
  path.join(SRC_DIR, "sync", "engine.ts"),
];

/** Collect every .ts source file under backend/src (excluding tests + sync.ts). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (EXCLUDE.some((ex) => full === ex || full.startsWith(ex + path.sep))) continue;
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Extract string/template literal *contents* from JS source via a state machine
 * that skips // and block comments and respects backslash escapes. Sound against
 * stray quotes in SQL and comments (the failure mode of a plain regex).
 */
function extractLiterals(src: string): string[] {
  const lits: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      let buf = "";
      while (i < n) {
        if (src[i] === "\\") {
          buf += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        buf += src[i++];
      }
      lits.push(buf);
      continue;
    }
    i++;
  }
  return lits;
}

describe("Standards · soft-delete read filter", () => {
  test("every SELECT ... FROM a soft-deletable table filters deleted_at IS NULL", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(SRC_DIR, file);
      const dynamicAllowed = DYNAMIC_FROM_ALLOWLIST.includes(file);
      for (const lit of extractLiterals(src)) {
        const sql = lit.replace(/\s+/g, " ").trim();
        if (!/\bSELECT\b/i.test(sql)) continue;
        // Interpolated table name in a SELECT — the literal scan can't see which
        // table it is. Require an explicit allowlist so a future interpolated
        // client read can't silently skip the deleted_at filter.
        if (/\bFROM\s+\$\{/.test(sql) && !dynamicAllowed) {
          violations.push(
            `${rel}: SELECT with an interpolated table name (FROM \${...}); verify deleted_at handling and allowlist if it intentionally reads tombstones → ${sql.slice(0, 120)}`,
          );
        }
        for (const t of SOFT_TABLES) {
          if (new RegExp(`\\bFROM\\s+${t}\\b`, "i").test(sql) && !/deleted_at\s+IS\s+NULL/i.test(sql)) {
            violations.push(`${rel}: read from '${t}' without 'deleted_at IS NULL' → ${sql.slice(0, 120)}`);
          }
        }
      }
    }
    assert.equal(
      violations.length,
      0,
      `Unfiltered reads of soft-deletable tables (would leak tombstoned rows):\n${violations.join("\n")}`,
    );
  });
});
