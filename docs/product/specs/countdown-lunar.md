# PRD — Countdown lunar/solar calendar · P1 (model + logic) (#43)

See ADR-0005 for the design and decisions.

## User story
As a user with lunar-calendar anniversaries (e.g. a 农历 birthday), I want a
countdown to recur on the correct **lunar** date each year and display as a lunar
date — not be limited to the solar calendar.

P1 delivers the data model + date logic end-to-end (no authoring UI yet; that is P2).

## Scope (P1)
Persist a `calendar` flag, sync it, and make the days-remaining + label logic
calendar-aware. `date` remains an always-solar anchor.

## Acceptance criteria
- **AC1** `countdown_events` gains `calendar TEXT NOT NULL DEFAULT 'solar'` via an
  idempotent migration; existing rows read back as `'solar'`.
- **AC2** `POST /v1/countdowns` accepts `calendar: 'solar' | 'lunar'` (defaults to
  `'solar'` when omitted), rejects any other value with 400, and round-trips the
  value through GET; `PATCH` can update it. Bulk `/migrate` carries it too.
- **AC3** `calendar` is in the sync manifest for `countdown_events` (replicates
  across devices); the four-tuple/standards guard still passes.
- **AC4** `daysUntil(date, repeat, 'lunar')`:
  - `repeat='none'` → diff to the solar anchor.
  - `repeat='yearly'` → diff to the **next lunar occurrence** (regular month each
    year; day 30 clamps to 廿九 in a short month).
  - out-of-range anchor (<1900/>2100) → falls back to solar handling.
- **AC5** `fmtDate(date, repeat, locale, 'lunar')` renders the Chinese lunar date
  (with year for one-time, without for yearly); falls back to the solar label when
  conversion is unavailable.
- **AC6** All existing countdown behaviour (solar) is unchanged; typecheck / lint /
  unit / build / backend api+security+standards all green.

## Out of scope (→ P2)
- Form modal solar/lunar toggle + lunar date picker; lunar card display polish;
  i18n strings for the picker; Playwright UI cases.
