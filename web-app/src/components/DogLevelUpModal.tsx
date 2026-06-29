import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDogStore, getTierFromLevel, getTierName } from "@/store/useDogStore";
import { DogSvg } from "@/components/DogSvg";
import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { captureAndShare, isShareCancellation } from "@/utils/share";
import { toast } from "@/store/useToastStore";

const TIER_COLORS = {
  puppy:     "#c89645",
  adult:     "#d4a030",
  wise:      "#8899aa",
  legendary: "#a0c8ff",
};

export function DogLevelUpModal() {
  const { pendingLevelUp, clearPendingLevelUp } = useDogStore();
  const locale = useAppStore((s) => s.locale);
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(clearPendingLevelUp, !!pendingLevelUp);

  if (!pendingLevelUp) return null;

  const tier = getTierFromLevel(pendingLevelUp);
  const tierName = getTierName(tier, locale as "en" | "zh");
  const accentColor = TIER_COLORS[tier];

  async function handleShare() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      await captureAndShare(
        cardRef.current,
        "lumo-dog-levelup.png",
        `Lumo Dog reached Lv.${pendingLevelUp}!`,
      );
    } catch (e) {
      // A user-cancelled share is silent; a genuine export failure must NOT be
      // swallowed — surface it like the other share cards do.
      if (!isShareCancellation(e)) toast.error(t("stats.share.error"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) clearPendingLevelUp(); }}
    >
      <div
        ref={cardRef}
        style={{
          background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-base) 100%)",
          border: `1px solid ${accentColor}40`,
          borderRadius: 24,
          padding: "40px 48px",
          maxWidth: 360,
          width: "90vw",
          textAlign: "center",
          position: "relative",
          boxShadow: `0 0 60px ${accentColor}20, 0 20px 60px rgba(0,0,0,0.6)`,
        }}
      >
        <button
          onClick={clearPendingLevelUp}
          aria-label={t("qc.close")}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            color: "var(--text-faint)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <DogSvg mood="excited" size={80} level={pendingLevelUp} />
        </div>

        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {t("dog.levelup.label")}
        </div>

        <div style={{ fontSize: 36, fontWeight: 700, color: accentColor, lineHeight: 1 }}>
          Lv.{pendingLevelUp}
        </div>

        <div style={{ fontSize: 16, color: "var(--text-secondary)", marginTop: 6 }}>
          {tierName}
        </div>

        {getTierFromLevel(pendingLevelUp) !== getTierFromLevel(Math.max(1, pendingLevelUp - 1)) && (
          <div
            style={{
              marginTop: 14,
              padding: "8px 16px",
              borderRadius: "var(--radius-lg)",
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}40`,
              fontSize: 13,
              color: accentColor,
            }}
          >
            {t(`dog.tier.unlocked.${tier}`)}
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
          {t("dog.levelup.hint")}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <button
            onClick={handleShare}
            disabled={busy}
            className="btn btn-primary"
            style={{ minWidth: 100 }}
          >
            {busy ? t("stats.share.busy") : t("dog.levelup.share")}
          </button>
          <button onClick={clearPendingLevelUp} className="btn btn-ghost">
            {t("dog.levelup.dismiss")}
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-faint)" }}>
          lumo.app · Lumo Dog
        </div>
      </div>
    </div>,
    document.body
  );
}
