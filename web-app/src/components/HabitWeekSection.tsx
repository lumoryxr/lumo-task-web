import { useT } from "@/i18n/useT";
import type { Habit, HabitLog } from "@/types/task";
import { currentStreak, habitColor, toDateStr } from "@/utils/habits";

function weekTarget(habit: Habit): number {
  switch (habit.frequency) {
    case "daily": return 7;
    case "weekdays": return 5;
    case "weekend": return 2;
    case "days_of_week": return (habit.frequencyDays ?? []).length;
    case "times_per_week": return habit.frequencyTimes ?? 3;
    case "interval": return Math.max(1, Math.floor(7 / (habit.frequencyInterval ?? 2)));
    default: return 7;
  }
}

interface CardProps {
  habit: Habit;
  logs: HabitLog[];
  weekStart: Date;
  weekEnd: Date;
}

function HabitWeekCard({ habit, logs, weekStart, weekEnd }: CardProps) {
  const t = useT();
  const color = habitColor(habit);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  const doneCount = logs.filter(
    (l) => l.habitId === habit.id && l.date >= weekStartStr && l.date <= weekEndStr,
  ).length;

  const targetCount = weekTarget(habit);
  const rate = targetCount === 0 ? 0 : Math.min(1, doneCount / targetCount);
  const pct = Math.round(rate * 100);
  const streak = currentStreak(habit, logs);

  let statusKey: string;
  let statusColor: string;
  if (rate >= 0.85) {
    statusKey = "stats.habits.ontrack";
    statusColor = "var(--status-success)";
  } else if (rate >= 0.5) {
    statusKey = "stats.habits.keepgoing";
    statusColor = "var(--status-warning)";
  } else {
    statusKey = "stats.habits.needsattention";
    statusColor = "var(--status-danger)";
  }

  return (
    <div
      className="flex flex-col gap-2 p-3 surface-card"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {habit.emoji && (
          <span className="text-base leading-none flex-shrink-0">{habit.emoji}</span>
        )}
        <span className="text-[13px] font-medium text-text-primary truncate">{habit.title}</span>
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className="text-[20px] font-bold tabular-nums leading-none"
          style={{ color }}
        >
          {doneCount}
        </span>
        <span className="text-[12px] text-text-muted">/ {targetCount}</span>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
        role="progressbar"
        aria-label={habit.title}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      <div className="flex items-center justify-between gap-1">
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate"
          style={{ color: statusColor, background: `${statusColor}18` }}
        >
          {t(statusKey)}
        </span>
        {streak > 0 && (
          <span className="text-[10px] text-text-faint flex-shrink-0">
            🔥 {streak} {t("stats.habits.streak")}
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  habits: Habit[];
  logs: HabitLog[];
  weekStart: Date;
  weekEnd: Date;
}

export function HabitWeekSection({ habits, logs, weekStart, weekEnd }: Props) {
  const t = useT();

  if (habits.length === 0) return null;

  return (
    <section>
      <h2 className="text-[13px] font-semibold text-text-secondary mb-3">
        {t("stats.habits.section")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {habits.map((habit) => (
          <HabitWeekCard
            key={habit.id}
            habit={habit}
            logs={logs}
            weekStart={weekStart}
            weekEnd={weekEnd}
          />
        ))}
      </div>
    </section>
  );
}
