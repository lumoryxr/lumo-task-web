import { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { STRINGS } from "@/i18n/strings";
import type { LocalizedString, Locale } from "@/types/task";

/** Hook returning a translator bound to the active locale. */
export function useT() {
  const locale = useAppStore((s) => s.locale);
  return (key: string): string => STRINGS[locale][key] ?? key;
}

/** Non-hook translator — safe to call from Zustand stores and plain functions. */
export function t(key: string): string {
  const locale = useAppStore.getState().locale;
  return STRINGS[locale][key] ?? STRINGS["en"][key] ?? key;
}

/** Pick the right field off a `LocalizedString`, falling back to English. */
export function pickLocale(value: LocalizedString | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] ?? value.en ?? "";
}

/**
 * Hook variant of `pickLocale`.
 *
 * Returns a STABLE reference: the returned function identity only changes when
 * the active `locale` changes. This matters for downstream `useEffect` /
 * `useMemo` dependency arrays — a freshly-allocated arrow on every render
 * would force every consumer to either drop `ls` from its deps (hiding bugs
 * the next time `pickLocale` learns to depend on more than `locale`) or pin
 * to a ref to placate the linter. Stable-by-locale keeps both call sites
 * correct and lint-clean.
 */
export function useLocaleString() {
  const locale = useAppStore((s) => s.locale);
  return useCallback(
    (value: LocalizedString | undefined) => pickLocale(value, locale),
    [locale]
  );
}
