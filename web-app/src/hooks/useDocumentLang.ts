import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Reflects the active UI locale onto the document root as `<html lang>`.
 * `index.html` ships a static `lang="en"`, but the app switches language at
 * runtime, so without this the attribute would go stale after an EN⇄ZH switch.
 * Keeping `<html lang>` accurate lets screen readers pick the right
 * pronunciation and search engines tag the page's language correctly.
 *
 * Mirrors `useReducedMotionClass`, which similarly syncs a store value onto
 * the document root.
 */
export function useDocumentLang() {
  const locale = useAppStore((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
