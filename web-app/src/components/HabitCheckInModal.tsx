import { useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import type { Habit, HabitLog } from "@/types/task";
import { currentStreak } from "@/utils/habits";

const COLOR_MAP: Record<string, string> = {
  green:  "var(--status-success)",
  cyan:   "var(--accent-primary)",
  amber:  "var(--status-warning)",
  red:    "var(--status-danger)",
  purple: "#a78bfa",
};

const MOTIVATION_COUNT = 5;

interface Props {
  habit: Habit;
  logs: HabitLog[];
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function HabitCheckInModal({ habit, logs, onConfirm, onClose }: Props) {
  const t = useT();
  const color = COLOR_MAP[habit.color] ?? COLOR_MAP.green;
  const [confirmed, setConfirmed] = useState(false);
  const streak = currentStreak(habit, logs);

  // Pick a daily-stable motivational message
  const motivationIndex = new Date().getDate() % MOTIVATION_COUNT;
  const motivation = t(`habit.checkin.motivation.${motivationIndex}`);

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  async function handleConfirm() {
    if (confirmed) return;
    setConfirmed(true);
    try {
      // Wait for the log to persist before closing — a failed check-in keeps
      // the modal open (store already toasts) so the user can retry instead of
      // believing it succeeded.
      await onConfirm();
      onClose();
    } catch {
      setConfirmed(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-surface border border-border-faint shadow-2xl overflow-hidden"
      >
        {/* Color accent header band */}
        <div
          className="h-24 w-full flex items-center justify-center relative"
          style={{ background: `linear-gradient(135deg, ${color}33 0%, ${color}18 100%)` }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: `radial-gradient(circle at 50% 80%, ${color} 0%, transparent 70%)` }}
          />
          {habit.emoji ? (
            <span className="text-5xl leading-none relative z-10 select-none">{habit.emoji}</span>
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center relative z-10"
              style={{ background: `${color}33`, border: `2px solid ${color}55` }}
            >
              <IconCheck size={28} style={{ color }} />
            </div>
          )}
        </div>

        <div className="px-6 pt-5 pb-6 space-y-4">
          {/* Habit identity */}
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-[18px] font-semibold text-text-primary">{habit.title}</h2>
            {streak > 0 && (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-0.5 rounded-full"
                style={{ background: `${color}22`, color }}
              >
                🔥 {streak} {t("habit.checkin.streak")}
              </span>
            )}
          </div>

          {/* Motivational message */}
          <p className="text-[13px] text-text-muted text-center leading-relaxed px-2">
            {motivation}
          </p>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            disabled={confirmed}
            aria-busy={confirmed}
            aria-label={t("habit.checkin.btn")}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ background: color, opacity: confirmed ? 0.5 : 1, cursor: confirmed ? "default" : "pointer" }}
          >
            {confirmed ? (
              <Spinner size={16} />
            ) : (
              <>
                <IconCheck size={16} />
                {t("habit.checkin.btn")}
              </>
            )}
          </button>

          {/* Cancel */}
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl text-[13px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {t("habit.btn.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
