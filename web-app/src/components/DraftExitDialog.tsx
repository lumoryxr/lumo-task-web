import { createPortal } from "react-dom";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";

interface DraftExitDialogProps {
  open: boolean;
  /** Close the form and keep what was typed for next time. */
  onKeep: () => void;
  /** Close the form and throw the input away. */
  onDiscard: () => void;
  /** Stay in the form. Escape and a click outside also mean this. */
  onContinue: () => void;
}

/**
 * Asked when a task form with unsaved input is closed from its X: keep the
 * draft (it comes back next time), discard it, or keep editing. Every
 * accidental dismissal maps to "keep editing", so nothing is ever lost by a
 * stray key or click.
 */
export function DraftExitDialog({ open, onKeep, onDiscard, onContinue }: DraftExitDialogProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onContinue, open);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onContinue(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={t("draft.exit.title")}
        aria-describedby="draft-exit-message"
        ref={dialogRef}
        tabIndex={-1}
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-[14px] border"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lifted)" }}
      >
        <div className="px-5 pt-5 pb-4">
          <h2 className="m-0 text-[15px] font-semibold text-text-primary">{t("draft.exit.title")}</h2>
          <p id="draft-exit-message" className="mt-2.5 mb-0 text-[13px] leading-relaxed text-text-secondary">
            {t("draft.exit.message")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
          <button type="button" className="btn btn-ghost" onClick={onContinue}>
            {t("draft.exit.continue")}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={{
              color: "var(--status-urgent)",
              border: "1px solid color-mix(in srgb, var(--status-urgent) 40%, transparent)",
              background: "color-mix(in srgb, var(--status-urgent) 10%, transparent)",
            }}
          >
            {t("draft.exit.discard")}
          </button>
          <button type="button" autoFocus className="btn btn-primary" onClick={onKeep}>
            {t("draft.exit.keep")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
