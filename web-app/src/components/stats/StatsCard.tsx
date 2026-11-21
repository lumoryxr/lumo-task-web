import type { ReactNode } from "react";

/** The frame every Stats panel shares: a title, a one-line explanation and the body. */
export function StatsCard({
  title,
  sub,
  icon,
  aside,
  className = "",
  children,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`surface-card p-4 sm:p-5 flex flex-col min-w-0 ${className}`} aria-label={title}>
      <header className="flex items-start gap-2.5 mb-4">
        {icon && (
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
          >
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-text-primary leading-tight">{title}</h2>
          {sub && <p className="text-[12px] text-text-muted mt-0.5">{sub}</p>}
        </div>
        {aside && <div className="flex-shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
