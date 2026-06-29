import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { captureAndShare, isShareCancellation } from "@/utils/share";
import { useModalA11y } from "@/hooks/useModalA11y";

interface StreakMilestoneCardProps {
  milestone: number;
  userName: string;
  onDismiss: () => void;
}

/**
 * Celebratory, shareable card shown once when a user's completion streak reaches
 * a milestone (#192). Mirrors DogLevelUpModal's overlay + a11y shell; only the
 * inner `cardRef` (the visual card, no controls) is captured to PNG, so the
 * shared image stays clean. Esc (via useModalA11y), backdrop click, and the
 * Dismiss button all close it.
 */
export function StreakMilestoneCard({ milestone, userName, onDismiss }: StreakMilestoneCardProps) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onDismiss);

  async function handleShare() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      await captureAndShare(cardRef.current, "lumo-streak.png", t("streak.milestone.label"));
    } catch (e) {
      // A dismissed share sheet is a normal cancellation; anything else is a
      // real export failure the user should know about.
      if (!isShareCancellation(e)) toast.error(t("stats.share.error"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("streak.milestone.label")}
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 16,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      {/* Captured area — visual card only, no controls. */}
      <div
        ref={cardRef}
        style={{
          background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-base) 100%)",
          border: "1px solid var(--accent-edge)",
          borderRadius: 24,
          padding: "40px 48px",
          maxWidth: 360,
          width: "90vw",
          textAlign: "center",
          boxShadow: "0 0 60px var(--accent-fog), 0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 12 }} aria-hidden="true">🔥</div>

        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {t("streak.milestone.label")}
        </div>

        <div style={{ fontSize: 40, fontWeight: 700, color: "var(--accent-primary)", lineHeight: 1 }}>
          {t("streak.milestone.days").replace("{n}", String(milestone))}
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
          {t("streak.milestone.caption")}
        </div>

        <div style={{ marginTop: 22, fontSize: 11, color: "var(--text-faint)" }}>
          lumo.app · {userName}
        </div>
      </div>

      {/* Controls — outside the captured area. */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={handleShare} disabled={busy} className="btn btn-primary" style={{ minWidth: 100 }}>
          {busy ? t("stats.share.busy") : t("stats.share.btn")}
        </button>
        <button onClick={onDismiss} className="btn btn-ghost">
          {t("dog.levelup.dismiss")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
