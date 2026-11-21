import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useT } from "@/i18n/useT";
import { ProjectContentEditor } from "@/components/ProjectContentEditor";
import { IconClose } from "@/components/icons";

interface Props {
  value?: string;
  onChange: (json: string) => void;
  onClose: () => void;
}

/**
 * View/edit a project's rich-text notes in a large, focused modal. The project
 * page shows no notes itself — only a Notes button that opens this. Edits
 * autosave through `onChange` (the last one is flushed on close), so closing
 * simply dismisses; there's no separate save step.
 */
export function ProjectNotesModal({ value, onChange, onClose }: Props) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("project.content.title")}
        ref={dialogRef}
        tabIndex={-1}
        data-size="large"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          // Roomy: most of the window, so long notes read and edit comfortably.
          width: 960, maxWidth: "calc(100vw - 32px)",
          height: "min(860px, calc(100dvh - 48px))",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header (pinned) */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border-faint)", flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("project.content.title")}
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

        {/* Editor body: the editor fills it and scrolls inside. */}
        <div style={{ flex: 1, minHeight: 0, padding: "16px 20px" }}>
          <ProjectContentEditor value={value} onChange={onChange} fill />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end",
          padding: "12px 20px", borderTop: "1px solid var(--border-faint)", flexShrink: 0,
        }}>
          <button type="button" onClick={onClose} className="btn btn-primary" style={{ height: 32, fontSize: 13 }}>
            {t("project.content.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
