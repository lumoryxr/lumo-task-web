/**
 * Client-side id generator using the server's prefix convention. Lets a store
 * create an entity with a stable id immediately (optimistic insert) before the
 * server round-trip resolves.
 */
export function clientId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand.slice(0, 20)}`;
}
