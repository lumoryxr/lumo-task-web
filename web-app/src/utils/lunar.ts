import solarlunar from "solarlunar";

/**
 * Chinese-lunar ↔ solar helpers for countdown events (#43).
 *
 * Storage model: a countdown's `date` is ALWAYS a solar (Gregorian) ISO anchor.
 * For a lunar event the anchor is the solar date of its (first) occurrence; the
 * lunar month/day is recovered from the anchor on demand. We never store the
 * lunar month/day separately.
 *
 * `solarlunar` covers lunar years 1900–2100; we guard that range and degrade
 * gracefully (callers fall back to plain solar handling) rather than throw.
 */
export const LUNAR_MIN_YEAR = 1900;
export const LUNAR_MAX_YEAR = 2100;

export interface LunarParts {
  lYear: number;
  lMonth: number;
  lDay: number;
  isLeap: boolean;
  monthCn: string;
  dayCn: string;
  yearCn: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse a 'YYYY-MM-DD' anchor into {year, month, day} (no timezone). */
function parseISO(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isLunarSupportedYear(y: number): boolean {
  return y >= LUNAR_MIN_YEAR && y <= LUNAR_MAX_YEAR;
}

/** Solar ISO anchor → its lunar parts, or null if out of range / unparseable. */
export function solarISOToLunar(iso: string): LunarParts | null {
  const p = parseISO(iso);
  if (!p || !isLunarSupportedYear(p.y)) return null;
  const r = solarlunar.solar2lunar(p.y, p.m, p.d);
  if (r === -1) return null;
  return {
    lYear: r.lYear,
    lMonth: r.lMonth,
    lDay: r.lDay,
    isLeap: r.isLeap,
    monthCn: r.monthCn,
    dayCn: r.dayCn,
    yearCn: r.yearCn,
  };
}

/** Lunar (year, month, day, isLeap) → solar ISO 'YYYY-MM-DD', or null if invalid. */
export function lunarToSolarISO(
  lYear: number,
  lMonth: number,
  lDay: number,
  isLeap = false,
): string | null {
  if (!isLunarSupportedYear(lYear)) return null;
  const r = solarlunar.lunar2solar(lYear, lMonth, lDay, isLeap);
  if (r === -1) return null;
  return `${r.cYear}-${pad(r.cMonth)}-${pad(r.cDay)}`;
}

/** Days (29 or 30) in lunar month `m` of lunar year `y`; 0 if out of range. */
export function lunarMonthDays(lYear: number, lMonth: number): number {
  if (!isLunarSupportedYear(lYear)) return 0;
  return solarlunar.monthDays(lYear, lMonth);
}

/**
 * Display a solar anchor as its lunar date, e.g. "五月十二" (no year) or
 * "二零二六年五月十二" (with year). Returns null if out of range.
 */
export function formatLunarISO(iso: string, opts: { withYear?: boolean } = {}): string | null {
  const lp = solarISOToLunar(iso);
  if (!lp) return null;
  return opts.withYear ? `${lp.yearCn}${lp.monthCn}${lp.dayCn}` : `${lp.monthCn}${lp.dayCn}`;
}

/**
 * Next solar ISO occurrence of a yearly-recurring lunar event, on/after `from`.
 *
 * Semantics (per ADR-0005): recurrence keys on the anchor's lunar **month/day**,
 * recurring on the **regular** month each year (a leap-month anchor recurs as the
 * regular month). If the target lunar month is short (29 days) in a given year
 * and the day is 30, it clamps to the last day (廿九) — mirroring solar clamping.
 *
 * Returns null if the anchor is unparseable / out of supported range, so callers
 * can fall back to solar handling.
 */
export function nextLunarYearlyISO(anchorISO: string, from: Date): string | null {
  const lp = solarISOToLunar(anchorISO);
  if (!lp) return null;

  const fromY = from.getFullYear();
  // Scan a small window of lunar years around `from` (a lunar date can map to a
  // solar date in the previous/next Gregorian year near the lunar new year).
  let best: string | null = null;
  for (let ly = fromY - 1; ly <= fromY + 2; ly++) {
    if (!isLunarSupportedYear(ly)) continue;
    const days = lunarMonthDays(ly, lp.lMonth);
    if (!days) continue; // month doesn't exist that year
    const day = Math.min(lp.lDay, days); // clamp 30 → 29 in a short month
    const iso = lunarToSolarISO(ly, lp.lMonth, day, false);
    if (!iso) continue;
    const occ = new Date(iso + "T00:00:00");
    if (occ.getTime() >= from.getTime() && (best === null || iso < best)) {
      best = iso;
    }
  }
  return best;
}
