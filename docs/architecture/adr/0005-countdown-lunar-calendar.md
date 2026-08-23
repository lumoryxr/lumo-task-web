# ADR 0005 — Countdown lunar/solar calendar

- Status: **Proposed**
- Date: 2026-06-26
- Requirement: Jalen (2026-06-26, issue #43). Countdown events should support the
  Chinese **lunar** calendar in addition to the **solar** (Gregorian) one — e.g.
  a lunar birthday that recurs every year on 农历五月初一.

## Context

A `CountdownEvent` has a `date` (solar `YYYY-MM-DD`) and `repeat` (`none` | `yearly`).
Lunar dates differ from solar in two ways that matter here:

1. **Display** — a lunar event should read as 农历五月初一, not its solar date.
2. **Yearly recurrence** — a lunar anniversary recurs on the same *lunar* month/day,
   whose *solar* date shifts ~11 days each year; lunar months are 29 or 30 days and
   some years insert a leap month (闰月).

## Decision

1. **Storage = solar anchor + one flag.** Add `calendar: 'solar' | 'lunar'`. `date`
   stays an **always-solar ISO anchor** (for a lunar event it is the solar date of
   the first occurrence). The lunar month/day is *derived* from the anchor on demand
   — we do **not** store lunar month/day columns. Existing rows default to `'solar'`,
   so behaviour is unchanged; sorting/reminders keep working off a computed next
   *solar* occurrence.

2. **Conversion library = `solarlunar`.** Lightweight, covers lunar years 1900–2100,
   provides `solar2lunar` / `lunar2solar` (with leap + Chinese strings) and
   `monthDays`. It is imported only by the countdown utils, so it ships inside the
   **lazy `/countdown` route chunk**, never the main bundle (verified in build).

3. **Yearly lunar recurrence semantics.** Recurrence keys on the anchor's lunar
   **month/day**, recurring on the **regular** month each year (a leap-month anchor
   recurs as the regular month — the common product choice). If the target lunar
   month is short (29 days) and the day is 30, it **clamps to 廿九** — mirroring the
   existing solar Feb-29 → Feb-28 clamp.

4. **Display.** Lunar events render the Chinese lunar string (with the year for
   one-time events, without for yearly). Out-of-range anchors (<1900 / >2100) fall
   back to solar handling rather than throwing.

## Consequences

- Minimal, backward-compatible schema (one nullable-with-default column), added to
  the sync manifest so it replicates across devices.
- No cross-DB or multi-tenant impact (consistent with ADR-0004).
- Bounded to 1900–2100 (the library's range); inputs outside degrade to solar.

## Rollout

- **P1 (this ADR):** data model end-to-end (migration, route, sync manifest, types,
  client) + lunar utils + calendar-aware `daysUntil`/`fmtDate` + tests. Default and
  existing behaviour unchanged; no UI to author lunar yet.
- **P2:** form modal solar/lunar toggle + lunar date picker (年/月/日 + 闰月), lunar
  card display polish, i18n, Playwright.
