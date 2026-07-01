import { useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { IconClose } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import type { Project, ProjectColor } from "@/types/task";

const COLORS: ProjectColor[] = ["green", "cyan", "amber", "red"];
const COLOR_PRIMARY: Record<ProjectColor, string> = {
  green: "var(--accent-primary)",
  cyan: "var(--status-info)",
  amber: "var(--status-warning)",
  red: "var(--status-urgent)",
};

interface ProjectFormModalProps {
  onClose: () => void;
  onCreated: (p: Project) => void;
}

/**
 * Create-a-project dialog. Replaces the old "instantly spawn an Untitled
 * project and jump in" flow so the name/category/color/first-goal are set up
 * front, and an accidental click doesn't litter the gallery with blanks.
 */
export function ProjectFormModal({ onClose, onCreated }: ProjectFormModalProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const create = useProjectsStore((s) => s.create);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState<ProjectColor>("green");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const trimmedGoal = goal.trim();
      const p = await create({
        name: name.trim() || t("project.untitled"),
        emoji: emoji.trim() || undefined,
        category: category.trim() || undefined,
        color,
        goals: trimmedGoal ? [{ text: trimmedGoal, done: false }] : [],
        status: "active",
      });
      onCreated(p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("project.new")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 420, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border-faint)",
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("project.new")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("qc.close")}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          {/* Emoji + name */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flexShrink: 0 }}>
              <Label text={t("project.field.emoji")} />
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="📁"
                maxLength={4}
                aria-label={t("project.field.emoji")}
                style={{ ...inputStyle(), width: 52, textAlign: "center" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label text={t("project.field.name")} required />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("project.field.namePlaceholder")}
                aria-label={t("project.field.name")}
                style={inputStyle()}
              />
            </div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("project.category.label")} />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("project.category.placeholder")}
              aria-label={t("project.category.label")}
              style={inputStyle()}
            />
          </div>

          {/* Color */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("project.color.label")} />
            <div style={{ display: "flex", gap: 10 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className="rounded-full transition-transform"
                  style={{
                    width: 24, height: 24, background: COLOR_PRIMARY[c], cursor: "pointer",
                    border: "none",
                    outline: color === c ? "2px solid var(--text-primary)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          {/* First goal (optional) */}
          <div style={{ marginBottom: 20 }}>
            <Label text={t("project.create.goal")} />
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("project.goals.placeholder")}
              aria-label={t("project.create.goal")}
              style={inputStyle()}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="transition-colors"
              style={{
                padding: "8px 18px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)", background: "transparent",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              {t("project.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="transition-colors"
              style={{
                padding: "8px 20px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent-edge)",
                background: busy ? "var(--bg-subtle)" : "var(--accent-fog)",
                color: "var(--accent-primary)", fontSize: 13, fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
              }}
            >
              {t("project.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
    }}>
      {text}{required && <span style={{ color: "var(--status-urgent)", marginLeft: 2 }}>*</span>}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%", height: 40, padding: "0 12px",
    background: "var(--bg-subtle)", border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-md)", color: "var(--text-primary)",
    fontSize: 13, outline: "none", transition: "border-color 150ms", boxSizing: "border-box",
  };
}
