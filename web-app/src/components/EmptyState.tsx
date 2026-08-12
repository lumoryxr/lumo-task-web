import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Decorative icon element, e.g. `<IconStats size={28} />`. Rendered aria-hidden. */
  icon: ReactNode;
  /** Short headline, already localized. */
  title: string;
  /** Optional one-line explanation, already localized. */
  subtitle?: string;
  /** Optional primary action. Omit for a purely informational empty state. */
  cta?: { label: string; onClick: () => void };
  /** "page" = tall, full-height centered (default). "panel" = compact, for inside cards/lists. */
  variant?: "page" | "panel";
  className?: string;
}

/**
 * Consistent, friendly empty state: an accent-tinted icon, a title, an optional
 * subtitle, and an optional call-to-action — the shared replacement for the
 * bare "no items yet" text scattered across list pages.
 *
 * Accessibility: the whole block is one polite `role="status"` region so assistive
 * tech announces the message (e.g. "No members yet…") when it appears; the icon
 * is decorative (`aria-hidden`). It carries no essential motion, so it's already
 * reduced-motion safe.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  cta,
  variant = "page",
  className,
}: EmptyStateProps) {
  const page = variant === "page";
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center ${className ?? ""}`}
      style={{ padding: page ? "64px 32px" : "36px 20px", gap: 14 }}
    >
      <div
        aria-hidden="true"
        className="empty-halo flex items-center justify-center"
        style={{
          width: page ? 64 : 48,
          height: page ? 64 : 48,
          borderRadius: "50%",
          color: "var(--accent-primary)",
        }}
      >
        {icon}
      </div>

      <div>
        <div
          className="font-semibold"
          style={{ fontSize: page ? 16 : 14, color: "var(--text-primary)" }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              maxWidth: 320,
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {cta && (
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}
