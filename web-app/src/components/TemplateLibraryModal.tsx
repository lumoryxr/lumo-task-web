import { useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { IconBookmark, IconClose, IconEdit, IconTrash } from "@/components/icons";
import { useT, useLocaleString } from "@/i18n/useT";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import type { TaskTemplate } from "@/types/task";

const Q_CHIP: Record<string, string> = {
  Q1: "chip chip-q1",
  Q2: "chip chip-q2",
  Q3: "chip chip-q3",
  Q4: "chip chip-q4",
  unclassified: "chip",
};

interface Props {
  onClose: () => void;
}

/**
 * Template library (#173 V1). Lists the user's saved single-task templates and
 * lets them instantiate (create a fresh task), rename, or delete each one.
 * Deleting a template never touches tasks already created from it.
 */
export function TemplateLibraryModal({ onClose }: Props) {
  const t = useT();
  const ls = useLocaleString();
  const [pendingDelete, setPendingDelete] = useState<TaskTemplate | null>(null);
  // Suppress the library's own Esc-close while the confirm dialog is up, so Esc
  // cancels only the confirm rather than tearing down the whole library.
  const dialogRef = useModalA11y<HTMLDivElement>(() => { if (!pendingDelete) onClose(); });
  // Task templates only — project templates are instantiated from the Projects
  // page (#211 V2 ⭐3), not this task library.
  const templates = useTemplatesStore((s) => s.templates).filter(
    (tpl): tpl is TaskTemplate => tpl.kind === "task"
  );
  const instantiate = useTemplatesStore((s) => s.instantiate);
  const rename = useTemplatesStore((s) => s.rename);
  const remove = useTemplatesStore((s) => s.remove);
  // Guards the Use button against rapid double-clicks creating duplicate tasks.
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleUse(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await instantiate(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("template.library.title")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 460,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-faint)",
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("template.library.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            className="icon-btn-ghost"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none",
              color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: templates.length === 0 ? 0 : "8px" }}>
          {templates.length === 0 ? (
            <EmptyState
              variant="panel"
              icon={<IconBookmark size={22} />}
              title={t("template.library.empty.title")}
              subtitle={t("template.library.empty.subtitle")}
            />
          ) : (
            templates.map((tpl) => (
              <TemplateRow
                key={tpl.id}
                tpl={tpl}
                title={ls(tpl.payload.title) || tpl.name}
                busy={busyId === tpl.id}
                onUse={() => handleUse(tpl.id)}
                onRename={(name) => rename(tpl.id, name)}
                onDelete={() => setPendingDelete(tpl)}
              />
            ))
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={t("template.delete.confirm.title")}
        message={t("template.delete.confirm")}
        detail={pendingDelete ? (ls(pendingDelete.payload.title) || pendingDelete.name) : undefined}
        confirmLabel={t("template.delete")}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete.id); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function TemplateRow({
  tpl,
  title,
  busy,
  onUse,
  onRename,
  onDelete,
}: {
  tpl: TaskTemplate;
  title: string;
  busy: boolean;
  onUse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tpl.name);
  const subtaskCount = tpl.payload.subtasks?.length ?? 0;

  function commit() {
    const name = draft.trim();
    if (name && name !== tpl.name) onRename(name);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); setDraft(tpl.name); setEditing(false); }
            }}
            maxLength={200}
            placeholder={t("template.name.placeholder")}
            className="input"
            style={{ width: "100%", height: 32, fontSize: 13 }}
          />
        ) : (
          <>
            <div
              style={{
                fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {tpl.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span className={Q_CHIP[tpl.payload.quadrant] ?? "chip"} style={{ fontSize: 10 }}>
                {tpl.payload.quadrant === "unclassified" ? "—" : tpl.payload.quadrant}
              </span>
              <span
                style={{
                  fontSize: 11, color: "var(--text-muted)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180,
                }}
                title={title}
              >
                {title}
              </span>
              {subtaskCount > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>
                  · {subtaskCount} {t("template.subtasks")}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            className="btn btn-secondary"
            style={{ height: 30, fontSize: 12, minWidth: 52 }}
            onClick={onUse}
            disabled={busy}
            aria-busy={busy}
            aria-label={t("template.use")}
          >
            {busy ? <Spinner size={13} /> : t("template.use")}
          </button>
          <RowIconBtn label={t("template.rename")} onClick={() => { setDraft(tpl.name); setEditing(true); }}>
            <IconEdit size={13} />
          </RowIconBtn>
          <RowIconBtn label={t("template.delete")} danger onClick={onDelete}>
            <IconTrash size={13} />
          </RowIconBtn>
        </div>
      )}
    </div>
  );
}

function RowIconBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: "var(--radius-sm)",
        background: "transparent", border: "none",
        color: danger ? "var(--status-urgent)" : "var(--text-muted)",
        cursor: "pointer", transition: "background 120ms, color 120ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = danger ? "rgba(255,107,107,0.1)" : "var(--bg-elevated)";
        (e.currentTarget as HTMLElement).style.color = danger ? "var(--status-urgent)" : "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        (e.currentTarget as HTMLElement).style.color = danger ? "var(--status-urgent)" : "var(--text-muted)";
      }}
    >
      {children}
    </button>
  );
}
