import { useModalA11y } from "@/hooks/useModalA11y";
import { useT } from "@/i18n/useT";

interface ConfirmDialogProps {
  /** Controlled visibility. Renders nothing when false. */
  open: boolean;
  title: string;
  /** Body copy explaining the consequence. */
  message?: string;
  /** Optional secondary line (e.g. a path or name) shown muted under the message. */
  detail?: string;
  /** Confirm button label. Defaults to the shared "Confirm" string. */
  confirmLabel?: string;
  /** Cancel button label. Defaults to the shared "Cancel" string. */
  cancelLabel?: string;
  /** Destructive action → red confirm button. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app's single, standard confirmation dialog. Replaces native
 * `window.confirm()` (which renders an off-brand browser chrome dialog) and the
 * various one-off inline confirm modals, so every "are you sure?" looks and
 * behaves the same: same backdrop/panel tokens as ProjectFormModal, Esc/focus
 * trap/focus-return via useModalA11y, backdrop-click to cancel.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel, open);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 380, maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {title}
          </h2>
          {message && (
            <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
              {message}
            </p>
          )}
          {detail && (
            <p style={{
              margin: "8px 0 0", fontSize: 12, lineHeight: 1.4, color: "var(--text-muted)",
              wordBreak: "break-all",
            }}>
              {detail}
            </p>
          )}
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "0 20px 20px",
        }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 18px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)", background: "transparent",
              color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            style={danger ? {
              padding: "8px 20px", borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255,107,107,0.4)", background: "rgba(255,107,107,0.12)",
              color: "var(--status-urgent)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            } : {
              padding: "8px 20px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--accent-edge)", background: "var(--accent-fog)",
              color: "var(--accent-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
