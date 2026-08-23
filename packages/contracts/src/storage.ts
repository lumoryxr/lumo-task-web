import { z } from "zod";

/**
 * Storage contract — single source of truth for `GET /v1/storage/info`.
 *
 * Reports where the SQLite file backing this instance lives and how large it
 * has grown, so the desktop Settings screen can show "database: 12.4 MB at
 * …/Lumo/lumo.db" and offer to relocate it.
 *
 * Scope note: this is deliberately a *local-instance* introspection endpoint —
 * it describes the process's own DB file, so on a hosted deployment it reports
 * the server's path and is only ever readable by an authenticated user.
 */

export const StorageInfoWireSchema = z.object({
  /** Absolute path to the SQLite file currently in use. */
  dbPath: z.string(),
  /** Directory containing {@link StorageInfoWireSchema.shape.dbPath}. */
  dbDir: z.string(),
  /** Size in bytes; `0` before the file exists (first run). */
  dbSize: z.number(),
  /** Basename of the file, e.g. `lumo.db`. */
  dbName: z.string(),
});

export type StorageInfoWire = z.infer<typeof StorageInfoWireSchema>;
