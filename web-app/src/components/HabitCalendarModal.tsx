import { useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft, IconArrowRight, IconClose } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import type { Habit, HabitLog } from "@/types/task";
import {
  completionRate,
  currentStreak,
  isScheduledForDate,
  longestStreak,
  toDateStr,
  totalCompletions,
} from "@/utils/habits";

const COLOR_MAP: Record<string, string> = {
  green:  "var(--status-success)",
  cyan:   "var(--accent-primary)",
  amber:  "var(--status-warning)",
  red:    "var(--status-danger)",
  purple: "#a78bfa",
};

interface Props {
  habit: Habit;
  logs: HabitLog[];
  onClose: () => void;
}

export function HabitCalendarModal({ habit, logs, onClose }: Props) {
  const t = useT();
  const color = COLOR_MAP[habit.color] ?? COLOR_MAP.green;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  const streak = currentStreak(habit, logs);
  const best = longestStreak(habit, logs);
  const total = totalCompletions(habit, logs);
  const rate = completionRate(habit, logs, 30);

  // Completed dates set for quick lookup
  const completedSet = new Set(
    logs.filter((l) => l.habitId === habit.id).map((l) => l.date)
  );

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  // Build calendar grid (Mon–Sun)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Offset so grid starts on Monday (0=Mon)
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const todayStr = toDateStr(today);

  const DAY_HEADERS = ["mon","tue","wed","thu","fri","sat","sun"].map((d) =>
    t(`habit.day.${d}`)
  );

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full rounded-2xl bg-surface border border-border-faint shadow-2xl"
        style={{ maxWidth: 420 }}
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-faint">
          <div className="flex items-center gap-2">
            {habit.emoji && <span className="text-lg">{habit.emoji}</span>}
            <h2 className="text-[15px] font-semibold text-text-primary">{habit.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          >
            <IconClose size={15} />
          </button>
        </div>

        {/* Stats bar */}
        <div
          className="flex items-center justify-around px-5 py-3 border-b border-border-faint"
          style={{ background: "var(--bg-elevated)" }}
        >
          <StatItem label={t("habit.streak")} value={streak} color={color} />
          <div className="w-px h-8 bg-border-faint" />
          <StatItem label={t("habit.best")} value={best} />
          <div className="w-px h-8 bg-border-faint" />
          <StatItem label={t("habit.calendar.total")} value={total} />
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3">
          <button
            onClick={prevMonth}
            aria-label={t("habit.calendar.prevMonth")}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          >
            <IconArrowLeft size={14} />
          </button>
          <span className="text-[13px] font-semibold text-text-primary">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            aria-label={t("habit.calendar.nextMonth")}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
            disabled={year === today.getFullYear() && month === today.getMonth()}
            style={{
              opacity: year === today.getFullYear() && month === today.getMonth() ? 0.3 : 1,
            }}
          >
            <IconArrowRight size={14} />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="px-5 pb-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_HEADERS.map((h) => (
              <div key={h} className="text-center text-[10px] font-medium text-text-faint py-1">
                {h}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: rows * 7 }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              if (dayNum < 1 || dayNum > lastDay.getDate()) {
                return <div key={i} />;
              }
              const cellDate = new Date(year, month, dayNum);
              const dateStr = toDateStr(cellDate);
              const isFuture = dateStr > todayStr;
              const isToday = dateStr === todayStr;
              const scheduled = isScheduledForDate(habit, cellDate);
              const completed = completedSet.has(dateStr);

              if (isFuture || !scheduled) {
                return (
                  <div key={i} className="flex items-center justify-center h-8">
                    <span
                      className="text-[12px]"
                      style={{ color: isFuture ? "var(--text-faint)" : "var(--text-faint)", opacity: 0.4 }}
                    >
                      {dayNum}
                    </span>
                  </div>
                );
              }

              return (
                <div key={i} className="flex items-center justify-center h-8">
                  <div
                    className="flex items-center justify-center rounded-full transition-all"
                    style={{
                      width: 28,
                      height: 28,
                      background: completed ? color : "transparent",
                      border: completed
                        ? "none"
                        : `2px solid ${isToday ? color : "var(--border-default)"}`,
                      opacity: completed ? 1 : 0.6,
                    }}
                  >
                    <span
                      className="text-[11px] font-medium"
                      style={{
                        color: completed
                          ? "var(--text-inverse)"
                          : isToday
                          ? color
                          : "var(--text-muted)",
                      }}
                    >
                      {dayNum}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: completion rate */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t border-border-faint rounded-b-2xl"
          style={{ background: "var(--bg-elevated)" }}
        >
          <span className="text-[12px] text-text-muted">{t("habit.calendar.rate")}</span>
          <span className="text-[13px] font-semibold" style={{ color }}>
            {Math.round(rate * 100)}%
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="text-[18px] font-bold leading-none"
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </span>
      <span className="text-[10px] text-text-muted">{label}</span>
    </div>
  );
}
