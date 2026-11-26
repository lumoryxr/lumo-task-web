import { useState } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";
import { IconCheck, IconClose } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import type { Project, ProjectColor } from "@/types/task";
import { Spinner } from "@/components/Spinner";
import { FieldLabel } from "@/components/taskForm/FieldLabel";

const COLORS: ProjectColor[] = ["green", "cyan", "amber", "red"];
const COLOR_PRIMARY: Record<ProjectColor, string> = {
  green: "var(--accent-primary)",
  cyan: "var(--status-info)",
  amber: "var(--status-warning)",
  red: "var(--status-urgent)",
};
/** Quick picks so most people never have to type an emoji. */
const EMOJI_CHOICES = ["🚀", "📁", "🎯", "💼", "📚", "🎨", "💡", "🛠️", "🏠", "❤️"];

interface ProjectFormModalProps {
  onClose: () => void;
  onCreated?: (p: Project) => void;
  /** When set, the modal edits this project (name/emoji/category/color) instead
   *  of creating a new one. Goals/notes stay on the detail page. */
  project?: Project;
}

/**
 * Create- or edit-a-project dialog, on the same frame as the task dialogs
 * (header with an X, scrolling body, footer actions). A live preview tile shows
 * the emoji on the chosen colour; the emoji comes from a row of quick picks or
 * can be typed. Edit mode is how a project's name, emoji, category and colour
 * change — the detail page shows them as text, never as inline inputs.
 */
export function ProjectFormModal({ onClose, onCreated, project }: ProjectFormModalProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const create = useProjectsStore((s) => s.create);
  const update = useProjectsStore((s) => s.update);
  const isEdit = !!project;

  const [name, setName] = useState(project?.name ?? "");
  const [emoji, setEmoji] = useState(project?.emoji ?? "");
  const [category, setCategory] = useState(project?.category ?? "");
  const [color, setColor] = useState<ProjectColor>(project?.color ?? "green");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (project) {
        await update(project.id, {
          name: name.trim() || t("project.untitled"),
          emoji: emoji.trim() || undefined,
          category: category.trim() || undefined,
          color,
        });
        onClose();
        return;
      }
      const trimmedGoal = goal.trim();
      const p = await create({
        name: name.trim() || t("project.untitled"),
        emoji: emoji.trim() || undefined,
        category: category.trim() || undefined,
        color,
        goals: trimmedGoal ? [{ text: trimmedGoal, done: false }] : [],
        status: "active",
      });
      onCreated?.(p);
    } finally {
      setBusy(false);
    }
  }

  const title = isEdit ? t("project.edit") : t("project.new");

  return createPortal(
    <div
      className="task-dialog-backdrop fade-in z-[200]"
      style={{ background: "rgba(8, 11, 10, 0.6)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
        className="task-dialog border rounded-[14px] bg-elevated shadow-lifted"
        style={{ borderColor: "var(--border-default)", minHeight: "auto" }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          {/* Header — the project as it will look, with the X */}
          <header className="flex items-center gap-3 px-[18px] py-4 border-b border-border-faint flex-shrink-0">
            <span
              data-testid="project-preview"
              aria-hidden="true"
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl text-[20px] transition-colors"
              style={{ background: COLOR_PRIMARY[color], color: "var(--text-inverse)" }}
            >
              {emoji.trim() || "📁"}
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
              <p className="mt-0.5 text-[11.5px] text-text-muted truncate">
                {name.trim() || t("project.field.namePlaceholder")}
                {category.trim() ? ` · ${category.trim()}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("qc.close")}
              title={t("qc.close")}
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
            >
              <IconClose size={12} />
            </button>
          </header>

          <div className="task-dialog__body px-[18px] py-4 flex flex-col gap-4">
            <div>
              <FieldLabel>{t("project.field.name")}</FieldLabel>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("project.field.namePlaceholder")}
                aria-label={t("project.field.name")}
                maxLength={200}
                className="input"
                style={{ height: 40, fontSize: 14, fontWeight: 500 }}
              />
            </div>

            <div>
              <FieldLabel>{t("project.category.label")}</FieldLabel>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("project.category.placeholder")}
                aria-label={t("project.category.label")}
                maxLength={60}
                className="input"
                style={{ height: 38, fontSize: 13 }}
              />
            </div>

            <div>
              <FieldLabel>{t("project.field.emoji")}</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={e}
                    aria-pressed={emoji === e}
                    onClick={() => setEmoji(e)}
                    className="flex items-center justify-center w-9 h-9 rounded-lg text-[17px] transition-colors hover:bg-subtle"
                    style={{
                      background: emoji === e ? "var(--accent-fog)" : "var(--bg-subtle)",
                      border: `1px solid ${emoji === e ? "var(--accent-edge)" : "var(--border-faint)"}`,
                    }}
                  >
                    {e}
                  </button>
                ))}
                <input
                  value={EMOJI_CHOICES.includes(emoji) ? "" : emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  placeholder="✏️"
                  maxLength={4}
                  aria-label={t("project.field.emojiCustom")}
                  title={t("project.field.emojiCustom")}
                  className="input text-center"
                  style={{ width: 52, height: 36, fontSize: 16, padding: 0 }}
                />
              </div>
            </div>

            <div>
              <FieldLabel>{t("project.color.label")}</FieldLabel>
              <div className="flex items-center gap-2.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    className="flex items-center justify-center w-8 h-8 rounded-full transition-transform hover:scale-105"
                    style={{
                      background: COLOR_PRIMARY[c],
                      color: "var(--text-inverse)",
                      boxShadow: color === c ? "0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--text-primary)" : "none",
                    }}
                  >
                    {color === c && <IconCheck size={14} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            </div>

            {/* First goal (optional) — create only; goals are managed on the detail page. */}
            {!isEdit && (
              <div>
                <FieldLabel>{t("project.create.goal")}</FieldLabel>
                <input
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={t("project.goals.placeholder")}
                  aria-label={t("project.create.goal")}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 px-[18px] py-3 border-t border-border-faint flex-shrink-0">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("project.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 76 }}
              disabled={busy}
              aria-busy={busy}
              aria-label={isEdit ? t("project.save") : t("project.create")}
            >
              {busy ? <Spinner /> : isEdit ? t("project.save") : t("project.create")}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
