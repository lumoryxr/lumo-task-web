import { useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { EmptyState } from "@/components/EmptyState";
import { IconBookmark, IconClose, IconTrash } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import type { Project, ProjectTemplate } from "@/types/task";

interface Props {
  onClose: () => void;
  /** Called with the freshly created project so the page can navigate to it. */
  onCreated: (project: Project) => void;
}

/**
 * Project template picker (#211 V2 ⭐3). Lists the user's saved project
 * blueprints and instantiates a fresh project (+ its scaffold tasks) from the
 * chosen one. Deleting a template never touches projects already created.
 */
export function ProjectTemplatePicker({ onClose, onCreated }: Props) {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<ProjectTemplate | null>(null);
  // Suppress the picker's own Esc/backdrop-close while the confirm dialog is up,
  // so Esc cancels only the confirm rather than tearing down the whole picker.
  const dialogRef = useModalA11y<HTMLDivElement>(() => { if (!pendingDelete) onClose(); });
  const templates = useTemplatesStore((s) => s.templates).filter(
    (tpl): tpl is ProjectTemplate => tpl.kind === "project"
  );
  const instantiateProject = useTemplatesStore((s) => s.instantiateProject);
  const remove = useTemplatesStore((s) => s.remove);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleUse(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const project = await instantiateProject(id);
      if (project) {
        onClose();
        onCreated(project);
      }
    } finally {
      setBusyId(null);
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
        aria-label={t("project.template.title")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 460, maxWidth: "calc(100vw - 32px)", maxHeight: "85vh",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border-faint)", flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("project.template.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            className="icon-btn-ghost"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: templates.length === 0 ? 0 : "8px" }}>
          {templates.length === 0 ? (
            <EmptyState
              variant="panel"
              icon={<IconBookmark size={22} />}
              title={t("project.template.empty.title")}
              subtitle={t("project.template.empty.subtitle")}
            />
          ) : (
            templates.map((tpl) => (
              <div
                key={tpl.id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{tpl.payload.emoji || "📁"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {tpl.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {tpl.payload.goals.length > 0 && <span>🎯 {tpl.payload.goals.length} · </span>}
                    {tpl.payload.tasks.length} {t("project.tasks.title")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ height: 30, fontSize: 12, minWidth: 52 }}
                    onClick={() => handleUse(tpl.id)}
                    disabled={busyId === tpl.id}
                    aria-busy={busyId === tpl.id}
                    aria-label={t("template.use")}
                  >
                    {busyId === tpl.id ? <Spinner size={13} /> : t("template.use")}
                  </button>
                  <button
                    aria-label={t("template.delete")}
                    title={t("template.delete")}
                    onClick={() => setPendingDelete(tpl)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, borderRadius: "var(--radius-sm)",
                      background: "transparent", border: "none", color: "var(--status-urgent)", cursor: "pointer",
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={t("template.delete.confirm.title")}
        message={t("template.delete.confirm")}
        detail={pendingDelete?.name}
        confirmLabel={t("template.delete")}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete.id); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
