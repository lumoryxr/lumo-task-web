# PRD — Countdown lunar/solar calendar · P2 (authoring UI) (#43)

See ADR-0005 for the design and decisions. P1 (model + logic) shipped in #113;
this is P2, the user-facing authoring + display layer.

## User story
As a user with lunar-calendar anniversaries (e.g. a 农历 birthday), I want to
**create and edit** a countdown in the lunar calendar from the form, pick the
lunar year/month/day directly, and see at a glance that an event is lunar.

## Scope (P2)
Form modal solar/lunar toggle + lunar date picker; lunar badge on the card; i18n
for the new strings (en + zh); Playwright UI cases. No model/logic changes — it
builds entirely on P1's `calendar` flag and `utils/lunar.ts` / `utils/countdown.ts`.

## Acceptance criteria
- **AC1 — Calendar toggle.** The form shows a 公历 / 农历 (Solar / Lunar) segmented
  toggle, defaulting to **公历**. Existing solar authoring is unchanged when Solar
  is selected (the native `<input type="date">` stays).
- **AC2 — Lunar picker.** In Lunar mode the date input is replaced by a 年 / 月 / 日
  picker:
  - Year select spans the supported range (1900–2100).
  - Month select lists 正月…腊月 and, **only for years that have a leap month**,
    inserts the leap variant (e.g. 闰六月) right after its regular month.
  - Day select lists 初一…(廿九|三十), its length following the selected month's
    real length (29/30); a selected day past the new month's length clamps down.
- **AC3 — Conversion on save.** Submitting a lunar event stores `calendar:'lunar'`
  and `date` = the **solar ISO anchor** produced by converting the picked lunar
  date (`lunar2solar`). Submitting a solar event stores `calendar:'solar'` and the
  solar `date` as today. The persisted shape is exactly P1's contract.
- **AC4 — Edit pre-fill.** Editing a lunar event opens with the toggle on 农历 and
  the picker pre-selected to the event's lunar year/month/day (derived from its
  stored solar anchor via `solarISOToLunar`). Editing a solar event opens on 公历.
- **AC5 — Toggle preserves the anchor.** Flipping the toggle does not lose the
  chosen day: solar→lunar derives the lunar parts of the current solar `date`;
  lunar→solar keeps the resolved solar anchor in the date input.
- **AC6 — Range guard.** A lunar selection whose anchor falls outside 1900–2100
  (or otherwise fails to convert) blocks submit with an inline error; it can never
  persist an unconvertible lunar date.
- **AC7 — Card badge.** A lunar event's card shows a small **农历** badge (next to
  the date), so calendar type is visible at a glance; the date text already renders
  the Chinese lunar string from P1's `fmtDate`. Solar cards are unchanged.
- **AC8 — i18n.** Every new label has both en and zh entries; no raw i18n key can
  leak (enforced by the existing static guard + UI no-raw-key cases).
- **AC9 — Gates.** typecheck / lint / unit (incl. new modal + lunar-helper tests) /
  build all green; Playwright UI cases for the toggle + lunar picker pass in CI.

## Out of scope
- Lunar **term/festival** names (清明, 春节…) — display is the numeric lunar date only.
- Non-Chinese lunar calendars; sub-day precision; timezone handling (date-level, as today).
