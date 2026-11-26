import type { ReactNode } from "react";

/**
 * The building blocks every settings-style page shares (Settings, Account,
 * Change password): a titled section holding a card of rows, each row a label
 * (with optional helper) on the left and its control on the right. On a phone
 * the row stacks (see `.settings-row` in index.css).
 */
export function SettingsSection({
  title,
  danger,
  children,
}: {
  title: string;
  /** A destructive section (e.g. delete account): red title and border. */
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2
        className="text-[15px] font-semibold mb-3"
        style={{ color: danger ? "var(--status-urgent)" : "var(--text-primary)" }}
      >
        {title}
      </h2>
      <div
        className="surface-card overflow-hidden"
        style={danger ? { borderColor: "color-mix(in srgb, var(--status-urgent) 30%, transparent)" } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  helper,
  children,
}: {
  label: ReactNode;
  helper?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-row items-center px-5 py-4 border-t border-border-faint first:border-t-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-text-primary leading-snug">{label}</div>
        {helper && <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed max-w-[320px]">{helper}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Page frame for a settings-style page: same margins as the app's other pages. */
export function SettingsPageFrame({ children }: { children: ReactNode }) {
  return <div className="fade-in px-4 sm:px-7 py-6 sm:py-7 max-w-[760px] flex flex-col gap-8">{children}</div>;
}
