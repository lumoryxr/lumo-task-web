import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconCheck, IconMore } from "@/components/icons";
import { useT } from "@/i18n/useT";
import type { Habit, HabitLog } from "@/types/task";
import { currentStreak, habitColor, isCompletedToday, lastNDays, longestStreak } from "@/utils/habits";

interface Props {
  habit: Habit;
  logs: HabitLog[];
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShowCalendar: () => void;
}

const DAY_KEYS = ["habit.day.sun", "habit.day.mon", "habit.day.tue", "habit.day.wed", "habit.day.thu", "habit.day.fri", "habit.day.sat"];

/** `color` mixed into transparent at `pct`% — habit colours are CSS variables, so no hex alpha suffix. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/**
 * One habit as a card: its emoji on a tile in the habit's colour, the name and
 * schedule, the last seven days as a strip (filled = done, ring = scheduled
 * but missed, dim = rest day; today outlined), the running and best streak,
 * and a clear Check in button — or a "Checked in today" badge once done.
 */
export function HabitCard({ habit, logs, onCheckIn, onEdit, onDelete, onShowCalendar }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const done = isCompletedToday(habit, logs);
  const streak = currentStreak(habit, logs);
  const best = longestStreak(habit, logs);
  const color = habitColor(habit);
  const week = lastNDays(habit, logs, 7);
  const freqLabel =
    habit.frequency === "times_per_week"
      ? t("habit.freq.timesPerWeekN").replace("{n}", String(habit.frequencyTimes ?? 3))
      : habit.frequency === "interval"
        ? t("habit.freq.everyNDays").replace("{n}", String(habit.frequencyInterval ?? 2))
        : habit.frequency === "days_of_week"
          ? (habit.frequencyDays ?? []).slice().sort().map((d) => t(DAY_KEYS[d])).join(" · ") || t("habit.freq.days_of_week")
          : t(`habit.freq.${habit.frequency}`);

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
      data-done={done ? "true" : "false"}
      className="relative flex flex-col gap-3.5 p-4 surface-card transition-colors"
      style={{
        background: done ? `linear-gradient(180deg, ${tint(color, 10)}, transparent 70%), var(--bg-surface)` : undefined,
        borderColor: done ? tint(color, 35) : undefined,
      }}
    >
      {/* Head: emoji tile, name + schedule, actions */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-[22px]"
          style={{ background: tint(color, 18), boxShadow: `inset 0 0 0 1px ${tint(color, 30)}` }}
        >
          {habit.emoji || "✨"}
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="text-[14.5px] font-semibold text-text-primary truncate" title={habit.title}>
            {habit.title}
          </div>
          <div className="text-[12px] text-text-muted truncate mt-0.5">{freqLabel}</div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 -mr-1">
          <button
            onClick={onShowCalendar}
            aria-label={t("habit.calendar.title")}
            title={t("habit.calendar.title")}
            className="p-1.5 rounded-md text-text-faint hover:text-text-secondary hover:bg-elevated transition-colors"
          >
            <IconCalendar size={15} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t("habit.menu.open")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-1.5 rounded-md text-text-faint hover:text-text-secondary hover:bg-elevated transition-colors"
            >
              <IconMore size={15} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-[128px] rounded-lg border py-1"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border-strong)", boxShadow: "var(--shadow-lifted)" }}
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onEdit(); }}
                  className="w-full px-3 py-1.5 text-left text-[13px] text-text-secondary hover:bg-subtle hover:text-text-primary transition-colors"
                >
                  {t("habit.menu.edit")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-subtle transition-colors"
                  style={{ color: "var(--status-urgent)" }}
                >
                  {t("habit.menu.delete")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Last 7 days */}
      <ul aria-label={t("habit.last7")} className="grid grid-cols-7 gap-1">
        {week.map((d) => {
          const label = `${t(DAY_KEYS[d.weekday])} ${d.date}: ${d.done ? t("habit.day.done") : d.scheduled ? t("habit.day.missed") : t("habit.day.rest")}`;
          return (
            <li
              key={d.date}
              data-done={d.done ? "true" : "false"}
              data-today={d.isToday ? "true" : undefined}
              title={label}
              aria-label={label}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full"
                style={{
                  background: d.done ? color : d.scheduled ? "transparent" : "var(--bg-elevated)",
                  boxShadow: d.done
                    ? "none"
                    : d.scheduled
                      ? `inset 0 0 0 1.5px ${d.isToday ? color : "var(--border-strong)"}`
                      : "none",
                  outline: d.isToday ? `2px solid ${tint(color, 45)}` : "none",
                  outlineOffset: 2,
                  color: "var(--text-inverse)",
                }}
              >
                {d.done && <IconCheck size={12} strokeWidth={2.5} />}
              </span>
              <span
                className="text-[10px] leading-none"
                style={{ color: d.isToday ? "var(--text-primary)" : "var(--text-faint)", fontWeight: d.isToday ? 600 : 400 }}
              >
                {t(DAY_KEYS[d.weekday]).slice(0, 2)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Streak + check-in */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          {streak > 0 ? (
            <>
              <span className="text-[20px] font-semibold leading-none text-text-primary">🔥 {streak}</span>
              <span className="text-[11.5px] text-text-muted truncate">
                {t("habit.streak")}
                {best > streak ? ` · ${t("habit.best")} ${best}` : ""}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-text-faint truncate">
              {best > 0 ? `${t("habit.best")} ${best}` : t("habit.streak.0")}
            </span>
          )}
        </div>
        {done ? (
          <span
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12px] font-semibold"
            style={{ background: tint(color, 16), color: "var(--text-primary)", boxShadow: `inset 0 0 0 1px ${tint(color, 40)}` }}
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full" style={{ background: color, color: "var(--text-inverse)" }}>
              <IconCheck size={10} strokeWidth={3} />
            </span>
            {t("habit.checkin.already")}
          </span>
        ) : (
          <button
            onClick={onCheckIn}
            aria-label={t("habit.checkIn")}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[12.5px] font-semibold transition-colors hover:brightness-110"
            style={{ background: tint(color, 14), color: "var(--text-primary)", boxShadow: `inset 0 0 0 1px ${tint(color, 55)}` }}
          >
            <span className="w-3.5 h-3.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }} aria-hidden="true" />
            {t("habit.checkIn")}
          </button>
        )}
      </div>
    </div>
  );
}
