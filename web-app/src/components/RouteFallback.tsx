import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/i18n/useT";

/**
 * Suspense fallback shown while a lazily-loaded route chunk downloads.
 *
 * Route-level code splitting means each page arrives as a separate chunk, so a
 * brief load can occur on first navigation to a page. This keeps that moment
 * calm: a centered spinner + label, themed with CSS tokens, announced politely
 * to screen readers, and honoring the user's reduced-motion preference.
 */
export function RouteFallback() {
  const t = useT();
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  return (
    <div
      className={`route-fallback${reducedMotion ? " route-fallback--still" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="route-fallback__spinner" aria-hidden="true" />
      <span className="route-fallback__label">{t("app.loading")}</span>
    </div>
  );
}
