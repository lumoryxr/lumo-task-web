import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { captureAndShare, isShareCancellation } from "@/utils/share";
import { useModalA11y } from "@/hooks/useModalA11y";
import type { Project, ProjectColor } from "@/types/task";
import type { ProjectRecap } from "@/utils/projectRecap";

const COLOR_PRIMARY: Record<ProjectColor, string> = {
  green: "var(--accent-primary)",
  cyan: "var(--status-info)",
  amber: "var(--status-warning)",
  red: "var(--status-urgent)",
};

interface Props {
  project: Project;
  recap: ProjectRecap;
  userName: string;
  onClose: () => void;
}

/**
 * Shareable project recap card (#211 V2 ⭐5). Mirrors StreakMilestoneCard's
 * overlay + a11y shell; only the inner cardRef (visual, no controls) is
 * captured to PNG so the shared image stays clean.
 */
export function ProjectRecapCard({ project, recap, userName, onClose }: Props) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const primary = COLOR_PRIMARY[project.color];
  const focusHours = (recap.focusMinutes / 60).toFixed(1);

  async function handleShare() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      await captureAndShare(cardRef.current, "lumo-project.png", t("project.recap.title"));
    } catch (e) {
      if (!isShareCancellation(e)) toast.error(t("stats.share.error"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("project.recap.title")}
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, padding: 16,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Captured area — visual card only, no controls. */}
      <div
        ref={cardRef}
        style={{
          background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-base) 100%)",
          border: `1px solid ${primary}`,
          borderRadius: 24,
          padding: "36px 40px",
          maxWidth: 380,
          width: "90vw",
          boxShadow: `0 0 60px var(--accent-fog), 0 20px 60px rgba(0,0,0,0.6)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: 12, fontSize: 22,
              background: primary, color: "var(--text-inverse)",
            }}
            aria-hidden="true"
          >
            {project.emoji || "📁"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {t("project.recap.title")}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {project.name}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Stat value={String(recap.tasksCompleted)} label={t("project.recap.done")} primary={primary} />
          <Stat value={`${recap.progressPct}%`} label={t("project.recap.progress")} primary={primary} />
          <Stat value={focusHours} label={t("project.recap.focusHours")} primary={primary} />
          <Stat value={`${recap.goalsDone}/${recap.goalsTotal}`} label={t("project.recap.goals")} primary={primary} />
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: "var(--text-faint)" }}>
          lumo.app · {userName}
        </div>
      </div>

      {/* Controls — outside the captured area. */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={handleShare} disabled={busy} className="btn btn-primary" style={{ minWidth: 100 }}>
          {busy ? t("stats.share.busy") : t("stats.share.btn")}
        </button>
        <button onClick={onClose} className="btn btn-ghost">
          {t("qc.close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ value, label, primary }: { value: string; label: string; primary: string }) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: primary, lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}
