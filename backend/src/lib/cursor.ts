/**
 * Opaque keyset pagination cursor.
 *
 * Encodes the sort position of the last returned row — its `created_at` and
 * `id` — as a base64url token. The cursor carries no authorization: every
 * paginated query is independently re-scoped to the authenticated user, so a
 * cursor only expresses "continue after this (created_at,id)".
 */
export interface CursorPos {
  createdAt: string;
  id: string;
}

const SEP = "\x00"; // NUL — never appears in ISO timestamps or nanoid ids

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(pos: CursorPos): string {
  return Buffer.from(`${pos.createdAt}${SEP}${pos.id}`, "utf8").toString("base64url");
}

/** Decode a cursor token. Throws InvalidCursorError on any malformed input. */
export function decodeCursor(token: string): CursorPos {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }
  const parts = decoded.split(SEP);
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new InvalidCursorError();
  return { createdAt: parts[0], id: parts[1] };
}
