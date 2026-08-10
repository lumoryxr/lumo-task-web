/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { STRINGS } from "../strings";

// Pull every source file in as raw text at build time (Vite glob — works in the
// jsdom test env, unlike node:fs). Excludes the dict and tests via filtering below.
const RAW_SOURCES = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

const SOURCE_ENTRIES = Object.entries(RAW_SOURCES).filter(
  ([path]) => !/__tests__|\.test\.|\/i18n\/strings\.ts$/.test(path),
);

/**
 * Enumerated value domains for every dynamic `t(`prefix.${x}`)` call site.
 * Kept in lock-step with the source unions/consts so the guard below can
 * expand dynamic keys it cannot statically resolve. Update when a domain grows.
 */
const DYNAMIC_KEY_FAMILIES: Record<string, string[]> = {
  // HabitFrequency union (types/task.ts) — used by HabitFormModal / HabitCard
  "habit.freq.": ["daily", "weekdays", "weekend", "days_of_week", "times_per_week", "interval"],
  // weekday tokens — HabitFormModal day toggles + HabitCalendarModal headers
  "habit.day.": ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  // HabitColor union (types/task.ts)
  "habit.color.": ["green", "cyan", "amber", "red", "purple"],
  // HabitCheckInModal MOTIVATION_COUNT = 5 → indices 0..4
  "habit.checkin.motivation.": ["0", "1", "2", "3", "4"],
  // DogTier union (store/useDogStore.ts)
  "dog.tier.unlocked.": ["puppy", "adult", "wise", "legendary"],
  // TaskRecurrence union (RECURRENCE_VALUES in TaskEditModal)
  "task.recurrence.": ["none", "daily", "weekdays", "weekly", "monthly"],
  // Project detail view toggle (ProjectDetailPage) — list | board
  "project.view.": ["list", "board"],
  // GoalConfidence union (types/task.ts) — OKR check-in pill in ProjectDetailPage
  "project.goal.confidence.": ["on_track", "at_risk", "off_track"],
  // PetSpecies union (PetSvg.tsx) — species selector labels in SettingsPage
  "settings.pet.species.": ["dog", "cat", "fox", "panda", "robot"],
  // FeedbackCategory union (@lumo/contracts) — FeedbackPanel category select
  "settings.feedback.category.": ["bug", "idea", "question", "other"],
  // FeedbackStatus union (@lumo/contracts) — FeedbackPanel status badge/select
  "settings.feedback.status.": ["open", "in_progress", "resolved", "closed"],
  // PetSpecies union (PetSvg.tsx) — PetChat reads `.en` / `.zh`
  "pet.species.": [
    "dog.en", "cat.en", "fox.en", "panda.en", "robot.en",
    "dog.zh", "cat.zh", "fox.zh", "panda.zh", "robot.zh",
  ],
  // Per-species personality copy (#174, lib/petMood.ts petLineKey) — species ×
  // event. Only the wired events are enumerated here.
  "pet.line.": [
    "dog.celebrate", "cat.celebrate", "fox.celebrate", "panda.celebrate", "robot.celebrate",
    "dog.streak", "cat.streak", "fox.streak", "panda.streak", "robot.streak",
  ],
};

describe("i18n strings", () => {
  const enKeys = Object.keys(STRINGS.en);
  const zhKeys = Object.keys(STRINGS.zh);

  it("every en key also exists in zh", () => {
    const missing = enKeys.filter((k) => !STRINGS.zh[k]);
    expect(missing).toEqual([]);
  });

  it("every zh key also exists in en", () => {
    const missing = zhKeys.filter((k) => !STRINGS.en[k]);
    expect(missing).toEqual([]);
  });

  it("no key has an empty string value in en", () => {
    const empty = enKeys.filter((k) => STRINGS.en[k].trim() === "");
    expect(empty).toEqual([]);
  });

  it("has ai.chat.basicMode in both locales", () => {
    expect(STRINGS.en["ai.chat.basicMode"]).toBeTruthy();
    expect(STRINGS.zh["ai.chat.basicMode"]).toBeTruthy();
  });

  it("has pet.chat.empty in both locales", () => {
    expect(STRINGS.en["pet.chat.empty"]).toBeTruthy();
    expect(STRINGS.zh["pet.chat.empty"]).toBeTruthy();
  });

  // --- regression guard: every key the UI references must exist in the dict ---
  // Without this, a missing key silently renders as the raw key string in the UI
  // (e.g. "habit.freq.weekend"), the bug this suite was extended to prevent.
  describe("referenced keys exist", () => {
    const blobs = SOURCE_ENTRIES.map(([, src]) => src);

    // Static `t("literal")` / `t('literal')` references across the source tree.
    const staticRefs = new Map<string, string>();
    const staticRe = /\bt\(\s*["']([^"'`]+)["']\s*\)/g;
    SOURCE_ENTRIES.forEach(([path, src]) => {
      for (const m of src.matchAll(staticRe)) {
        if (!staticRefs.has(m[1])) staticRefs.set(m[1], path);
      }
    });

    it("every statically referenced t(\"…\") key is defined in en", () => {
      const missing = [...staticRefs]
        .filter(([k]) => !(k in STRINGS.en))
        .map(([k, f]) => `${k}  <- ${f}`);
      expect(missing).toEqual([]);
    });

    it("every enumerated dynamic key family is fully defined in en", () => {
      const missing: string[] = [];
      for (const [prefix, members] of Object.entries(DYNAMIC_KEY_FAMILIES)) {
        for (const m of members) {
          const key = prefix + m;
          if (!(key in STRINGS.en)) missing.push(key);
        }
      }
      expect(missing).toEqual([]);
    });

    it("no UI attribute is localized with a raw inline locale ternary (use t())", () => {
      // Catches the regression class `aria-label={locale === "zh" ? "更多" : "More"}`
      // — a hardcoded UI string that bypasses the catalog. Narrow by design: it
      // only flags a RAW string literal right after `?`, so the legitimate
      // `placeholder={locale === "zh" ? t("a") : t("b")}` form (both branches via
      // the catalog) is intentionally allowed. Prompt/text ternaries aren't in
      // attributes and are unaffected.
      const attrRe = /(aria-label|title|placeholder)\s*=\s*\{\s*locale\s*===?\s*["']zh["']\s*\?\s*["']/g;
      const offenders: string[] = [];
      SOURCE_ENTRIES.forEach(([path, src]) => {
        for (const m of src.matchAll(attrRe)) offenders.push(`${m[1]}  <- ${path}`);
      });
      expect(offenders).toEqual([]);
    });

    it("guards every dynamic t(`prefix.${…}`) call site found in source", () => {
      // Ensures DYNAMIC_KEY_FAMILIES stays in sync: any template-literal t()
      // prefix in the source must have an enumerated domain above.
      const dynRe = /\bt\(\s*`([a-zA-Z0-9_.]*?\.)\$\{/g;
      const unguarded = new Set<string>();
      for (const blob of blobs) {
        for (const m of blob.matchAll(dynRe)) {
          if (!(m[1] in DYNAMIC_KEY_FAMILIES)) unguarded.add(m[1]);
        }
      }
      expect([...unguarded]).toEqual([]);
    });
  });
});
