/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { STRINGS } from "@/i18n/strings";
import settingsSource from "../SettingsPage.tsx?raw";

/**
 * Regression guard for the Settings i18n sweep (Phase 1 polish).
 *
 * Settings used to render a pile of `locale === "zh" ? "中文" : "English"`
 * inline ternaries, which bypass the i18n dictionary entirely. They are now
 * routed through `t("…")` keys. This guard keeps them from creeping back in
 * *this* file — a raw quoted/template string as the branch of a `locale ===`
 * ternary is the exact anti-pattern we removed.
 *
 * Legitimate `locale === "zh"` uses remain (selecting a localized data field
 * or choosing between two existing dictionary keys); those don't put a raw
 * string literal immediately after the `?`, so they don't match.
 */
describe("SettingsPage i18n", () => {
  it("has no hardcoded `locale === \"zh\" ? \"literal\"` ternaries", () => {
    const rawLiteralTernary = /locale === "zh"\s*\?\s*[`"']/g;
    const offenders = settingsSource.match(rawLiteralTernary) ?? [];
    expect(offenders).toEqual([]);
  });

  it("defines every key the swept literals were moved to (en + zh parity)", () => {
    const keys = [
      "settings.pet.name.helper",
      "settings.ai.key.replacePlaceholder",
      "settings.ai.key.hide",
      "settings.ai.key.show",
      "settings.ai.baseUrl.helper",
      "settings.ai.testing",
      "settings.storage.copy",
      "settings.storage.copied",
      "settings.storage.localNote",
      "settings.sync.relative.justNow",
      "settings.sync.relative.minAgo",
      "settings.sync.relative.hrAgo",
    ];
    for (const k of keys) {
      expect(STRINGS.en[k], `missing en: ${k}`).toBeTruthy();
      expect(STRINGS.zh[k], `missing zh: ${k}`).toBeTruthy();
    }
  });

  it("keeps the `{n}` placeholder on the relative-time keys (interpolation contract)", () => {
    for (const k of ["settings.sync.relative.minAgo", "settings.sync.relative.hrAgo"]) {
      expect(STRINGS.en[k]).toContain("{n}");
      expect(STRINGS.zh[k]).toContain("{n}");
    }
  });
});
