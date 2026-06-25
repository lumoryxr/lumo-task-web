import type { CSSProperties, ReactNode } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/i18n/useT";

/**
 * A single decorative shimmer block used to build loading skeletons.
 *
 * Purely presentational — it is `aria-hidden` so screen readers announce the
 * parent {@link SkeletonScreen}'s status label instead of the individual bars.
 * Sizing/shape come from `className` (Tailwind) or `style`; colors are driven
 * by CSS tokens (see `.skeleton` in index.css) so it themes automatically.
 *
 * The shimmer animation honors both the OS `prefers-reduced-motion` media query
 * and the app's in-product `reducedMotion` setting (mirrors `RouteFallback`).
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  return (
    <span
      aria-hidden="true"
      className={`skeleton${reducedMotion ? " skeleton--still" : ""} ${className}`}
      style={style}
    />
  );
}

/**
 * Accessible wrapper around a group of {@link Skeleton} bars.
 *
 * Announces a polite, localized "Loading…" status (reusing `app.loading`) and
 * marks the region `aria-busy` so assistive tech knows content is pending,
 * while the visual bars stay decorative.
 */
export function SkeletonScreen({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={className}
    >
      <span className="sr-only">{label ?? t("app.loading")}</span>
      {children}
    </div>
  );
}
