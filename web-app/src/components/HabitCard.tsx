import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconCheck, IconMore } from "@/components/icons";
import { useT } from "@/i18n/useT";
import type { Habit, HabitLog } from "@/types/task";
import { currentStreak, habitColor, isCompletedToday, longestStreak } from "@/utils/habits";

interface Props {
  habit: Habit;
  logs: HabitLog[];
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShowCalendar: () => void;
}

export function HabitCard({ habit, logs, onCheckIn, onEdit, onDelete, onShowCalendar }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const done = isCompletedToday(habit, logs);
  const streak = currentStreak(habit, logs);
  const best = longestStreak(habit, logs);
  const color = habitColor(habit);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-3 surface-card surface-card--interactive"
      style={{
        borderLeft: `3px solid ${color}`,
        ...(done ? { background: `${color}0a` } : {}),
      }}
    >
      {/* Check button — static when done (no undo) */}
      {done ? (
        <div
          aria-hidden="true"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2"
          style={{
            borderColor: color,
            background: color,
            color: "var(--text-inverse)",
          }}
        >
          <IconCheck size={14} />
        </div>
      ) : (
        <button
          onClick={onCheckIn}
          aria-label={t("habit.done")}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors hover:border-current"
          style={{
            borderColor: "var(--border-faint)",
            background: "transparent",
            color: "var(--text-muted)",
          }}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {habit.emoji && (
            <span className={`text-base leading-none${done ? " opacity-70" : ""}`}>{habit.emoji}</span>
          )}
          <span
            className={`font-medium truncate${done ? " text-text-muted line-through decoration-1" : " text-text-primary"}`}
          >
            {habit.title}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {done ? (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
              style={{ background: `${color}28`, color }}
            >
              {t("habit.checkin.already")}
            </span>
          ) : (
            <span className="text-[11px] text-text-muted">
              {t(`habit.freq.${habit.frequency}`)}
            </span>
          )}
          {best > 0 && (
            <span className="text-[11px] text-text-faint">
              {t("habit.best")}: {best}
            </span>
          )}
        </div>
      </div>

      {/* Streak badge */}
      <div className="flex flex-col items-center flex-shrink-0 min-w-[48px]">
        {streak > 0 ? (
          <>
            <span className="text-[18px] font-bold leading-none" style={{ color }}>
              {streak}
            </span>
            <span className="text-[9px] text-text-muted mt-0.5">{t("habit.streak")}</span>
          </>
        ) : (
          <span className="text-[11px] text-text-faint">{t("habit.streak.0")}</span>
        )}
      </div>

      {/* Calendar shortcut */}
      <button
        onClick={onShowCalendar}
        aria-label={t("habit.calendar.title")}
        className="p-1.5 rounded-md text-text-faint hover:text-text-secondary hover:bg-elevated transition-colors flex-shrink-0"
      >
        <IconCalendar size={14} />
      </button>

      {/* Menu */}
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("habit.menu.open")}
          className="p-1.5 rounded-md text-text-faint hover:text-text-secondary hover:bg-elevated transition-colors"
        >
          <IconMore size={14} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-lg border border-border-faint bg-surface shadow-lg py-1">
            <button
              onClick={() => { setMenuOpen(false); onEdit(); }}
              className="w-full px-3 py-1.5 text-left text-[13px] text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors"
            >
              {t("habit.menu.edit")}
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-elevated transition-colors"
              style={{ color: "var(--status-danger)" }}
            >
              {t("habit.menu.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
