import type { Person } from "@/types/task";
import { useT } from "@/i18n/useT";
import { PersonAvatar } from "@/components/PersonAvatar";

type ChipPerson = Pick<Person, "id" | "name" | "initials" | "color">;

interface AssigneeChipProps {
  /** The task's assignees in order: the first is the primary assignee. */
  people: ChipPerson[];
  /** Avatar diameter in px. */
  size?: number;
  /**
   * "pill" — bordered capsule for the trailing slot of a wide row.
   * "inline" — borderless, sits inside a meta line (e.g. matrix cards).
   */
  variant?: "pill" | "inline";
  /** Tailwind max-width classes for the name text; it truncates past this. */
  nameMaxWidthClass?: string;
  /** Extra classes on the root, e.g. responsive visibility. */
  className?: string;
}

/**
 * Shows who owns a task: the primary assignee (主责任人) — avatar and full
 * name — plus a quiet "+N" when others share the task. The other assignees are
 * deliberately left to the task's details, so rows stay focused on the one
 * person responsible. The name truncates at `nameMaxWidthClass` so a long name
 * never pushes the row's layout around.
 */
export function AssigneeChip({
  people,
  size = 20,
  variant = "pill",
  nameMaxWidthClass = "max-w-[140px]",
  className = "",
}: AssigneeChipProps) {
  const t = useT();
  if (people.length === 0) return null;

  const [primary, ...others] = people;
  const label = (others.length > 0 ? t("assignee.primaryWithOthers") : t("assignee.primary"))
    .replace("{name}", primary.name)
    .replace("{n}", String(others.length));
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
      <div className="flex-shrink-0" aria-hidden="true">
        <PersonAvatar person={primary} size={size} />
      </div>
      <span
        className={`truncate leading-none ${nameMaxWidthClass} ${pill ? "text-[12px] font-medium" : ""}`}
        style={{ color: pill ? "var(--text-secondary)" : "inherit" }}
        aria-hidden="true"
      >
        {primary.name}
      </span>
      {others.length > 0 && (
        <span
          className="flex-shrink-0 leading-none text-[11px] font-semibold tabular-nums"
          style={{ color: "var(--text-faint)" }}
          aria-hidden="true"
        >
          +{others.length}
        </span>
      )}
    </div>
  );
}
