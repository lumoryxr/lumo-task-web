import { useId } from "react";
import { useT } from "@/i18n/useT";
import { PersonAvatar } from "@/components/PersonAvatar";
import type { Person } from "@/types/task";

type PickerPerson = Pick<Person, "id" | "name" | "initials" | "color">;

interface AssigneePickerProps {
  people: PickerPerson[];
  /** Assignee ids in order — the first is the owner (主责任人), the rest collaborators. */
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Which part to show: the single owner choice, the collaborators, or both.
   * The create form shows the owner up front and collaborators under "More".
   */
  part?: "both" | "primary" | "collaborators";
}

/**
 * Assignees as two fields: exactly one owner (主责任人, a single choice) and
 * any number of collaborators (协作人). Stored as one ordered list with the
 * owner first, so a task with assignees always has exactly one owner:
 * collaborators need an owner, and clearing the owner promotes the first
 * collaborator.
 */
export function AssigneePicker({ people, value, onChange, part = "both" }: AssigneePickerProps) {
  const t = useT();
  const ownerLabelId = useId();
  const collabLabelId = useId();
  const owner = value[0] ?? null;
  const collaborators = value.slice(1);

  function pickOwner(id: string) {
    if (id === owner) {
      // Clearing the owner: the first collaborator (if any) takes over.
      onChange(collaborators);
      return;
    }
    onChange([id, ...collaborators.filter((x) => x !== id)]);
  }

  function toggleCollaborator(id: string) {
    if (!owner || id === owner) return;
    onChange(
      collaborators.includes(id)
        ? [owner, ...collaborators.filter((x) => x !== id)]
        : [owner, ...collaborators, id],
    );
  }

  const labelClass = "text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint";

  return (
    <div className="flex flex-col gap-3">
      {part !== "collaborators" && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div id={ownerLabelId} className={labelClass}>{t("assignee.primaryLabel")}</div>
            {owner && (
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
          <div role="radiogroup" aria-labelledby={ownerLabelId} className="flex items-center gap-1.5 flex-wrap">
            {people.map((p) => {
              const checked = p.id === owner;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={p.name}
                  data-person={p.id}
                  onClick={() => pickOwner(p.id)}
                  className="flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full text-[12px] transition-colors"
                  style={{
                    border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
                    background: checked ? "var(--accent-fog)" : "var(--bg-surface)",
                    color: checked ? "var(--accent-primary)" : "var(--text-secondary)",
                    fontWeight: checked ? 600 : 500,
                  }}
                >
                  <span aria-hidden="true"><PersonAvatar person={p} size={18} /></span>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {part !== "primary" && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div id={collabLabelId} className={labelClass}>{t("assignee.others")}</div>
            {!owner && (
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {t("assignee.needPrimary")}
              </span>
            )}
          </div>
          <div role="group" aria-labelledby={collabLabelId} className="flex items-center gap-1.5 flex-wrap">
            {people
              .filter((p) => p.id !== owner)
              .map((p) => {
                const selected = collaborators.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={p.name}
                    disabled={!owner}
                    onClick={() => toggleCollaborator(p.id)}
                    className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      border: `1px solid ${selected ? "var(--accent-edge)" : "var(--border-default)"}`,
                      background: selected ? "var(--accent-dim)" : "var(--bg-surface)",
                      color: selected ? "var(--accent-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span aria-hidden="true"><PersonAvatar person={p} size={16} /></span>
                    {p.name}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
