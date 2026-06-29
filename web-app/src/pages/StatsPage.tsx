import { useEffect, useState } from "react";
import { IconStats } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { CompletedEntry } from "@/types/task";
import { computeWeekStats, computeAllTimeStats, fmtHour } from "@/utils/stats";
import { currentStreak as habitStreak, toDateStr } from "@/utils/habits";
import { shouldShowWrapped, markWrappedShown, computePrevWeekStats, computeMonthStats, shouldShowMonthlyWrapped, markMonthlyWrappedShown } from "@/utils/wrapped";
import { pendingStreakMilestone, markStreakMilestoneCelebrated } from "@/utils/streakMilestone";
import { useNavigate } from "react-router-dom";
import { ShareCard } from "@/components/ShareCard";
import { StreakMilestoneCard } from "@/components/StreakMilestoneCard";
import { WrappedCard } from "@/components/WrappedCard";
import { HabitWeekSection } from "@/components/HabitWeekSection";
import { QuadrantBreakdown } from "@/components/QuadrantBreakdown";
import { StatsSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/EmptyState";
import type { QuadrantCount } from "@/utils/stats";

const DAY_KEYS = ["stats.day.sun","stats.day.mon","stats.day.tue","stats.day.wed","stats.day.thu","stats.day.fri","stats.day.sat"];

function topQuadrantsSub(breakdown: QuadrantCount[]): string {
  const top2 = breakdown
    .filter((b) => b.count > 0 && b.quadrant !== "unclassified")
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
  if (top2.length === 0) return "";
  return top2.map((b) => `${b.quadrant}: ${b.count}`).join(" · ");
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-xl bg-surface border border-border-faint min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">{label}</span>
      <span className="text-[28px] font-bold text-text-primary leading-none tabular-nums" style={{ color: "var(--accent-primary)" }}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-text-muted">{sub}</span>}
    </div>
  );
}

export function StatsPage() {
  const t = useT();
  const navigate = useNavigate();
  const locale = useAppStore((s) => s.locale);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  const userName = useAuthStore((s) => s.user.name);
  const { habits, logs: habitLogs } = useHabitsStore();
  const [entries, setEntries] = useState<CompletedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWrapped, setShowWrapped] = useState(false);
  const [showMonthlyWrapped, setShowMonthlyWrapped] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    useTasksStore.getState().fetchAllCompleted().then((data) => {
      setEntries(data);
      setLoading(false);
      if (shouldShowWrapped(userId)) {
        setShowWrapped(true);
        markWrappedShown(userId);
      }
      if (shouldShowMonthlyWrapped(userId)) {
        setShowMonthlyWrapped(true);
        markMonthlyWrappedShown(userId);
      }
      // Celebrate a freshly-reached completion-streak milestone, once per user.
      const reached = pendingStreakMilestone(userId, computeAllTimeStats(data).currentStreak);
      if (reached !== null) {
        setStreakMilestone(reached);
        markStreakMilestoneCelebrated(userId, reached);
      }
    }).catch(() => setLoading(false));
  }, [isSignedIn, userId]);

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <IconStats size={28} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-text-primary">{t("auth.required.title")}</h2>
          <p className="mt-1 text-[13px] text-text-muted max-w-xs">Sign in to view your productivity stats.</p>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90"
          style={{ background: "var(--accent-primary)" }}
        >
          {t("auth.login.btn")}
        </button>
      </div>
    );
  }

  const week = computeWeekStats(entries);
  const allTime = computeAllTimeStats(entries);
  const prevWeekStats = computePrevWeekStats(entries);
  const monthStats = computeMonthStats(entries);

  const bestHabitStreak = habits.length > 0
    ? Math.max(...habits.map((h) => habitStreak(h, habitLogs)))
    : 0;

  const weekStartStr = toDateStr(week.weekStart);
  const weekEndStr = toDateStr(week.weekEnd);
  const weekHabitDone = habitLogs.filter(
    (l) => l.date >= weekStartStr && l.date <= weekEndStr,
  ).length;

  const focusHours = (week.focusMinutes / 60).toFixed(1);
  const allFocusHours = (allTime.focusMinutes / 60).toFixed(0);

  const weekLabel = `${week.weekStart.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })} – ${week.weekEnd.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}`;

  const maxDay = Math.max(...week.byDay, 1);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {streakMilestone !== null && (
        <StreakMilestoneCard
          milestone={streakMilestone}
          userName={userName}
          onDismiss={() => setStreakMilestone(null)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-7 pt-7 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-[20px] font-semibold text-text-primary">{t("stats.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("stats.sub")}</p>
        </div>
      </div>

      <div className="px-7 pb-7 space-y-6">
        {loading ? (
          <StatsSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<IconStats size={28} />}
            title={t("stats.empty.title")}
            subtitle={t("stats.empty")}
            cta={{ label: t("stats.empty.cta"), onClick: () => navigate("/matrix") }}
          />
        ) : (
          <>
            {/* Weekly Wrapped — shown once on Monday */}
            {showWrapped && prevWeekStats.tasksCompleted > 0 && (
              <section>
                <h2 className="text-[13px] font-semibold text-text-secondary mb-3">{t("wrapped.section.title")}</h2>
                <WrappedCard
                  stats={prevWeekStats}
                  currentStreak={allTime.currentStreak}
                  userName={userName}
                  onDismiss={() => setShowWrapped(false)}
                />
              </section>
            )}

            {/* Monthly Wrapped — shown once at the start of a new month */}
            {showMonthlyWrapped && monthStats.tasksCompleted > 0 && (
              <section>
                <h2 className="text-[13px] font-semibold text-text-secondary mb-3">{t("wrapped.month.section.title")}</h2>
                <WrappedCard
                  stats={monthStats}
                  currentStreak={allTime.currentStreak}
                  userName={userName}
                  period="month"
                  onDismiss={() => setShowMonthlyWrapped(false)}
                />
              </section>
            )}

            {/* Week stats */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold text-text-secondary">{t("stats.week")}</h2>
                <span className="text-[12px] text-text-faint">{weekLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("stats.tasks")}
                  value={week.tasksCompleted}
                  sub={topQuadrantsSub(week.quadrantBreakdown)}
                />
                <StatCard
                  label={t("stats.focus")}
                  value={`${focusHours}${t("stats.hours")}`}
                  sub={`${week.focusMinutes} ${t("stats.mins")}`}
                />
                <StatCard
                  label={t("stats.streak")}
                  value={allTime.currentStreak}
                  sub={t("stats.days")}
                />
                {week.peakHour !== null && (
                  <StatCard
                    label={t("stats.peak")}
                    value={fmtHour(week.peakHour)}
                  />
                )}
                {weekHabitDone > 0 && (
                  <StatCard
                    label={t("stats.habits.total")}
                    value={weekHabitDone}
                    sub={t("stats.habits.totalUnit")}
                  />
                )}
              </div>

              <QuadrantBreakdown breakdown={week.quadrantBreakdown} />

              {/* Daily bar chart */}
              <div className="mt-4 p-4 rounded-xl bg-surface border border-border-faint">
                <div className="flex items-end gap-2 h-16">
                  {week.byDay.map((count, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: count === 0 ? 2 : `${Math.max(8, (count / maxDay) * 52)}px`,
                          background: count > 0 ? "var(--accent-primary)" : "var(--bg-elevated)",
                          opacity: count > 0 ? 1 : 0.4,
                        }}
                      />
                      <span className="text-[9px] text-text-faint">{t(DAY_KEYS[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* All-time + habit streak */}
            <section>
              <h2 className="text-[13px] font-semibold text-text-secondary mb-3">{t("stats.alltime")}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={t("stats.tasks")} value={allTime.tasksCompleted} />
                <StatCard label={t("stats.focus")} value={`${allFocusHours}${t("stats.hours")}`} />
                <StatCard label={t("stats.best")} value={allTime.bestStreak} sub={t("stats.days")} />
                {bestHabitStreak > 0 && (
                  <StatCard label="🔥 Habit" value={bestHabitStreak} sub={t("stats.days")} />
                )}
              </div>
            </section>

            {/* Habit week section */}
            <HabitWeekSection
              habits={habits}
              logs={habitLogs}
              weekStart={week.weekStart}
              weekEnd={week.weekEnd}
            />

            {/* Share card */}
            <section>
              <ShareCard
                tasksCompleted={week.tasksCompleted}
                focusHours={focusHours}
                currentStreak={allTime.currentStreak}
                byDay={week.byDay}
                userName={userName}
                weekLabel={weekLabel}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
