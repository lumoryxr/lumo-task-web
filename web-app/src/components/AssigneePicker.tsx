import { useT } from "@/i18n/useT";
import { PersonAvatar } from "@/components/PersonAvatar";
import type { Person } from "@/types/task";

type PickerPerson = Pick<Person, "id" | "name" | "initials" | "color">;

interface AssigneePickerProps {
  people: PickerPerson[];
  /** Selected ids in order — the first is the primary assignee. */
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-select of a task's assignees with exactly one primary (主责任人).
 *
 * The primary is simply the first selected id, so the rule can't be broken:
 * the first person picked becomes the primary, ☆ on another selected person
 * moves them to the front, and removing the primary promotes the next one.
 */
export function AssigneePicker({ people, value, onChange }: AssigneePickerProps) {
  const t = useT();
  const primaryId = value[0] ?? null;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  function makePrimary(id: string) {
    onChange([id, ...value.filter((x) => x !== id)]);
  }

  // Selected people first (primary leading), then everyone else in list order.
  const ordered = [
    ...value.map((id) => people.find((p) => p.id === id)).filter((p): p is PickerPerson => Boolean(p)),
    ...people.filter((p) => !value.includes(p.id)),
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div id="assignee-picker-label" className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          {t("qc.assignee")}
        </div>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] transition-colors"
            style={{ color: "var(--text-faint)" }}
          >
            {t("qc.assignee.none")}
          </button>
        )}
      </div>
      <div role="group" aria-labelledby="assignee-picker-label" className="flex items-center gap-1.5 flex-wrap">
        {ordered.map((p) => {
          const selected = value.includes(p.id);
          const isPrimary = p.id === primaryId;
          return (
            <div
              key={p.id}
              data-person={p.id}
              className="flex items-center h-7 rounded-md text-[12px] transition-colors overflow-hidden"
              style={{
                border: `1px solid ${isPrimary ? "var(--accent-primary)" : selected ? "var(--accent-edge)" : "var(--border-default)"}`,
                background: isPrimary ? "var(--accent-fog)" : selected ? "var(--accent-dim)" : "var(--bg-surface)",
                color: selected ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(p.id)}
                className="flex items-center gap-1.5 h-full pl-2 pr-2.5"
              >
                <span aria-hidden="true"><PersonAvatar person={p} size={16} /></span>
                <span className={isPrimary ? "font-semibold" : ""}>{p.name}</span>
                {isPrimary && (
                  <span
                    className="rounded px-1 py-px text-[9.5px] font-bold leading-none"
                    style={{ color: "var(--text-inverse)", background: "var(--accent-primary)" }}
                  >
                    {t("assignee.primaryBadge")}
                  </span>
                )}
              </button>
              {selected && !isPrimary && (
                <button
                  type="button"
                  onClick={() => makePrimary(p.id)}
                  aria-label={t("assignee.makePrimary").replace("{name}", p.name)}
                  title={t("assignee.makePrimary").replace("{name}", p.name)}
                  className="flex items-center justify-center h-full w-6 text-[13px] leading-none transition-colors hover:text-text-primary"
                  style={{ borderLeft: "1px solid var(--accent-edge)", color: "var(--text-faint)" }}
                >
                  ☆
                </button>
              )}
            </div>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
          {t("assignee.primaryHint")}
        </p>
      )}
    </div>
  );
}
