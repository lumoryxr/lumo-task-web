import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { IconClose } from "@/components/icons";
import { LEGAL_DOCS, type LegalDocKey } from "@/pages/legal/content";

/**
 * In-app modal that shows a legal document (Terms of Service / Privacy Policy)
 * without leaving the auth screen. Reuses the same bilingual content as the
 * standalone `/legal/*` pages via the shared `content.ts` source.
 *
 * Follows the repo modal invariant: a real close button (X) in the header,
 * Esc/focus-trap/focus-return via `useModalA11y`, and backdrop-click to close.
 *
 * Renders nothing when `docKey` is null (closed).
 */
export function LegalModal({
  docKey,
  onClose,
}: {
  docKey: LegalDocKey | null;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const zh = locale === "zh";
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, docKey !== null);

  if (docKey === null) return null;

  const doc = LEGAL_DOCS[docKey];
  const pick = (v: { en: string; zh: string }) => (zh ? v.zh : v.en);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={pick(doc.title)}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 560, maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 64px)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header — title + effective date + close (X) */}
        <div
          style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 12, padding: "18px 20px 14px",
            borderBottom: "1px solid var(--border-faint)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
              {pick(doc.title)}
            </h2>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-muted)" }}>
              {zh ? "生效日期" : "Effective date"}: {doc.effectiveDate}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("legal.modal.close")}
            className="flex items-center justify-center flex-shrink-0 rounded-md text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            style={{ width: 30, height: 30, border: "1px solid var(--border-default)" }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", padding: "16px 20px 20px" }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            {pick(doc.intro)}
          </p>

          {doc.sections.map((s, i) => (
            <section key={i} style={{ marginTop: 18 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                {i + 1}. {pick(s.heading)}
              </h3>
              {(zh ? s.body.zh : s.body.en).map((para, j) => (
                <p key={j} style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
