import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { listRecaps, type RecapRef } from "@/utils/wrapped";
import type { CompletedEntry } from "@/types/task";
import { WrappedCard } from "@/components/WrappedCard";
import { EmptyState } from "@/components/EmptyState";
import { IconStats } from "@/components/icons";

interface RecapsModalProps {
  entries: CompletedEntry[];
  currentStreak: number;
  userName: string;
  onClose: () => void;
}

/**
 * Re-accessible recap gallery (#171 V2b): lists past weekly/monthly recaps that
 * had activity, and re-opens any one as a shareable WrappedCard.
 */
export function RecapsModal({ entries, currentStreak, userName, onClose }: RecapsModalProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const recaps = useMemo(() => listRecaps(entries), [entries]);
  const [selected, setSelected] = useState<RecapRef | null>(null);

  const weeks = recaps.filter((r) => r.kind === "week");
  const months = recaps.filter((r) => r.kind === "month");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("recaps.title")}
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          padding: 20,
          width: "min(440px, 92vw)",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {selected && (
              <button
                onClick={() => setSelected(null)}
                aria-label={t("recaps.back")}
                className="btn btn-ghost"
                style={{ minWidth: 0, padding: "4px 8px" }}
              >
                ←
              </button>
            )}
            <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {selected ? selected.stats.weekLabel : t("recaps.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        {selected ? (
          <WrappedCard
            stats={selected.stats}
            currentStreak={currentStreak}
            userName={userName}
            period={selected.kind}
            onDismiss={() => setSelected(null)}
          />
        ) : recaps.length === 0 ? (
          <EmptyState
            icon={<IconStats size={26} />}
            title={t("recaps.empty.title")}
            subtitle={t("recaps.empty.subtitle")}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {weeks.length > 0 && (
              <RecapGroup label={t("recaps.group.weeks")} items={weeks} tasksLabel={t("stats.tasks")} onPick={setSelected} />
            )}
            {months.length > 0 && (
              <RecapGroup label={t("recaps.group.months")} items={months} tasksLabel={t("stats.tasks")} onPick={setSelected} />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RecapGroup({
  label,
  items,
  tasksLabel,
  onPick,
}: {
  label: string;
  items: RecapRef[];
  tasksLabel: string;
  onPick: (r: RecapRef) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r)}
            className="transition-colors"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-faint)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{r.stats.weekLabel}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", tabSize: 2 }}>
              {r.stats.tasksCompleted} {tasksLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
