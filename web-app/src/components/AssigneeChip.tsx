import type { Person } from "@/types/task";
import { useT } from "@/i18n/useT";
import { PersonAvatar } from "@/components/PersonAvatar";

type ChipPerson = Pick<Person, "id" | "name" | "initials" | "color">;

interface AssigneeChipProps {
  people: ChipPerson[];
  /** Avatar diameter in px. */
  size?: number;
  /** How many names are spelled out before collapsing the rest into "+N". */
  maxNames?: number;
  /**
   * "pill" — bordered capsule for the trailing slot of a wide row.
   * "inline" — borderless, sits inside a meta line (e.g. matrix cards).
   */
  variant?: "pill" | "inline";
  /** Tailwind max-width classes for the names text; it truncates past this. */
  nameMaxWidthClass?: string;
  /** Extra classes on the root, e.g. responsive visibility. */
  className?: string;
}

/**
 * Shows who a task is assigned to: stacked avatars followed by their names.
 *
 * Names are spelled out (not just initials) so ownership is readable at a
 * glance, but the text truncates at `nameMaxWidthClass` so a long name never
 * pushes the row's layout around. The full list is always available through
 * the tooltip and the accessible label.
 */
export function AssigneeChip({
  people,
  size = 20,
  maxNames = 2,
  variant = "pill",
  nameMaxWidthClass = "max-w-[140px]",
  className = "",
}: AssigneeChipProps) {
  const t = useT();
  if (people.length === 0) return null;

  const sep = t("assignee.separator");
  const allNames = people.map((p) => p.name).join(sep);
  const label = t("assignee.label").replace("{names}", allNames);
  const shown = people.slice(0, maxNames);
  const overflow = people.length - shown.length;
  const pill = variant === "pill";

  return (
    <div
      className={`flex items-center min-w-0 ${pill ? "gap-1.5 rounded-full" : "gap-1"} ${className}`}
      title={label}
      aria-label={label}
      role="group"
      style={
        pill
          ? {
              padding: "2px 8px 2px 2px",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-faint)",
            }
          : undefined
      }
    >
      <div className="flex items-center flex-shrink-0" aria-hidden="true">
        {shown.map((p, i) => (
          <div
            key={p.id}
            style={{ marginLeft: i > 0 ? -Math.round(size * 0.3) : 0, zIndex: shown.length - i, position: "relative" }}
          >
            <PersonAvatar person={p} size={size} />
          </div>
        ))}
      </div>
      <span
        className={`truncate leading-none ${nameMaxWidthClass} ${pill ? "text-[12px] font-medium" : ""}`}
        style={{ color: pill ? "var(--text-secondary)" : "inherit" }}
      >
        {shown.map((p) => p.name).join(sep)}
      </span>
      {overflow > 0 && (
        <span
          className="flex-shrink-0 leading-none text-[11px] font-semibold tabular-nums"
          style={{ color: "var(--text-faint)" }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
