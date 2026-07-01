/**
 * Pill-shaped toggle used by the plan filter bars (tags, projects) on the
 * Today and Matrix views. Extracted so both pages share one look and a11y
 * contract (#211 V2 ⭐2 project filter reuse).
 */
export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors"
      style={{
        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
        background: active ? "var(--accent-fog)" : "var(--bg-deep)",
        border: `1px solid ${active ? "var(--accent-edge)" : "var(--border-default)"}`,
      }}
    >
      {label}
    </button>
  );
}
