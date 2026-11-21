import { useEffect, useState } from "react";
import { IconCalendar, IconCheck, IconClock, IconHabit, IconMatrix, IconNote, IconProject, IconSparkle, IconStats } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { CompletedEntry } from "@/types/task";
import { computeWeekStats, computeAllTimeStats } from "@/utils/stats";
import { computeDashboard, deltaPct } from "@/utils/statsDashboard";
import { useProjectsStore } from "@/store/useProjectsStore";
import { currentStreak as habitStreak } from "@/utils/habits";
import { shouldShowWrapped, markWrappedShown, computePrevWeekStats, computeMonthStats, shouldShowMonthlyWrapped, markMonthlyWrappedShown, computeYearStats, shouldShowYearlyWrapped, markYearlyWrappedShown } from "@/utils/wrapped";
import { pendingStreakMilestone, markStreakMilestoneCelebrated } from "@/utils/streakMilestone";
import { useNavigate } from "react-router-dom";
import { ShareCard } from "@/components/ShareCard";
import { StreakMilestoneCard } from "@/components/StreakMilestoneCard";
import { RecapsModal } from "@/components/RecapsModal";
import { WrappedCard } from "@/components/WrappedCard";
import { HabitWeekSection } from "@/components/HabitWeekSection";
import { QuadrantBreakdown } from "@/components/QuadrantBreakdown";
import { StatsSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/EmptyState";
import { StatTile } from "@/components/stats/StatTile";
import { StatsCard } from "@/components/stats/StatsCard";
import { DailyChart } from "@/components/stats/DailyChart";
import { HourHeatmap } from "@/components/stats/HourHeatmap";
import { RankedList, type RankedItem } from "@/components/stats/RankedList";
import { Highlights, type Highlight } from "@/components/stats/Highlights";

const RANGES = [7, 30, 90] as const;
type StatsRange = (typeof RANGES)[number];
const WEEKDAY_LONG_KEYS = [
  "stats.weekday.mon", "stats.weekday.tue", "stats.weekday.wed", "stats.weekday.thu",
  "stats.weekday.fri", "stats.weekday.sat", "stats.weekday.sun",
];

function AllTimeFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-text-muted truncate">{label}</dt>
      <dd className="text-[20px] font-semibold text-text-primary mt-0.5">{value}</dd>
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
  const [showYearlyWrapped, setShowYearlyWrapped] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [showRecaps, setShowRecaps] = useState(false);
  const [range, setRange] = useState<StatsRange>(30);
  const projects = useProjectsStore((s) => s.projects);

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
      if (shouldShowYearlyWrapped(userId)) {
        setShowYearlyWrapped(true);
        markYearlyWrappedShown(userId);
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
          <p className="mt-1 text-[13px] text-text-muted max-w-xs">{t("auth.required.stats")}</p>
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
  const yearStats = computeYearStats(entries);
  const dash = computeDashboard(entries, range);

  const bestHabitStreak = habits.length > 0
    ? Math.max(...habits.map((h) => habitStreak(h, habitLogs)))
    : 0;

  const focusHours = (week.focusMinutes / 60).toFixed(1);
  const allFocusHours = (allTime.focusMinutes / 60).toFixed(0);
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";
  const weekLabel = `${week.weekStart.toLocaleDateString(dateLocale, { month: "short", day: "numeric" })} – ${week.weekEnd.toLocaleDateString(dateLocale, { month: "short", day: "numeric" })}`;
  const fmtHours = (min: number) => (min >= 600 ? String(Math.round(min / 60)) : (min / 60).toFixed(1));
  const fmtDay = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(dateLocale, { month: "short", day: "numeric", weekday: "short" });
  };

  const projectItems: RankedItem[] = dash.projects.slice(0, 5).map((p) => {
    const proj = projects.find((x) => x.id === p.id);
    return {
      key: p.id,
      label: proj?.name ?? t("stats.projects.unknown"),
      count: p.count,
      lead: proj?.emoji ? <span aria-hidden="true">{proj.emoji}</span> : undefined,
    };
  });
  const tagItems: RankedItem[] = dash.tags.slice(0, 6).map((tc) => ({ key: tc.tag, label: `#${tc.tag}`, count: tc.count }));

  const q2 = dash.quadrants.find((q) => q.quadrant === "Q2");
  const highlights: Highlight[] = [];
  if (dash.bestDay) {
    highlights.push({
      key: "best",
      icon: <IconStats size={15} />,
      text: t("stats.highlights.bestDay").replace("{date}", fmtDay(dash.bestDay.date)).replace("{n}", String(dash.bestDay.count)),
    });
  }
  if (dash.peakHour !== null) {
    highlights.push({
      key: "peak",
      icon: <IconClock size={15} />,
      text: t("stats.highlights.peak").replace("{hour}", `${dash.peakHour}:00`),
    });
  }
  if (dash.peakWeekday !== null && range > 7) {
    highlights.push({
      key: "weekday",
      icon: <IconCalendar size={15} />,
      text: t("stats.highlights.weekday").replace("{day}", t(WEEKDAY_LONG_KEYS[dash.peakWeekday])),
    });
  }
  if (q2 && q2.count > 0) {
    highlights.push({
      key: "q2",
      icon: <IconMatrix size={15} />,
      text: t("stats.highlights.q2").replace("{pct}", String(q2.percent)),
    });
  }
  if (dash.tasks > 0 && dash.focusMinutes > 0) {
    highlights.push({
      key: "perTask",
      icon: <IconSparkle size={15} />,
      text: t("stats.highlights.focusPerTask").replace("{n}", String(Math.round(dash.focusMinutes / dash.tasks))),
    });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {streakMilestone !== null && (
        <StreakMilestoneCard
          milestone={streakMilestone}
          userName={userName}
          onDismiss={() => setStreakMilestone(null)}
        />
      )}
      {showRecaps && (
        <RecapsModal
          entries={entries}
          currentStreak={allTime.currentStreak}
          userName={userName}
          onClose={() => setShowRecaps(false)}
        />
      )}
      {/* Header — the range picker sits in one row above everything it scopes */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-7 pt-7 pb-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-text-primary">{t("stats.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("stats.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label={t("stats.range.label")}
            className="flex items-center rounded-lg p-0.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className="px-3 py-1 rounded-md text-[12px] font-medium transition-colors"
                style={{
                  background: range === r ? "var(--bg-surface)" : "transparent",
                  color: range === r ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: range === r ? "var(--shadow-card)" : "none",
                }}
              >
                {t(`stats.range.${r}`)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRecaps(true)}
            className="btn btn-secondary"
            style={{ height: 32, fontSize: 12 }}
          >
            {t("recaps.title")}
          </button>
        </div>
      </div>

      <div className="px-7 pb-7 space-y-3">
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

            {/* Yearly Wrapped — shown once at the start of a new year */}
            {showYearlyWrapped && yearStats.tasksCompleted > 0 && (
              <section>
                <h2 className="text-[13px] font-semibold text-text-secondary mb-3">{t("wrapped.year.section.title")}</h2>
                <WrappedCard
                  stats={yearStats}
                  currentStreak={allTime.currentStreak}
                  userName={userName}
                  period="year"
                  onDismiss={() => setShowYearlyWrapped(false)}
                />
              </section>
            )}

            {/* KPI row — the period at a glance, each against the period before */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3">
              <StatTile
                icon={<IconCheck size={15} strokeWidth={2} />}
                label={t("stats.kpi.tasks")}
                value={String(dash.tasks)}
                delta={deltaPct(dash.tasks, dash.prevTasks)}
                rangeDays={range}
                trend={dash.daily.map((p) => p.count)}
              />
              <StatTile
                icon={<IconClock size={15} />}
                label={t("stats.kpi.focus")}
                value={`${fmtHours(dash.focusMinutes)}${t("stats.hours")}`}
                sub={`${dash.focusMinutes} ${t("stats.mins")}`}
                delta={deltaPct(dash.focusMinutes, dash.prevFocusMinutes)}
                rangeDays={range}
                trend={dash.daily.map((p) => p.minutes)}
              />
              <StatTile
                icon={<IconHabit size={15} />}
                label={t("stats.kpi.streak")}
                value={`${allTime.currentStreak}`}
                sub={t("stats.kpi.streak.sub").replace("{n}", String(allTime.bestStreak))}
              />
              <StatTile
                icon={<IconStats size={15} />}
                label={t("stats.kpi.avg")}
                value={String(dash.avgPerActiveDay)}
                sub={t("stats.kpi.avg.sub").replace("{n}", String(dash.activeDays)).replace("{d}", String(range))}
              />
            </div>

            {/* Trend + highlights */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <StatsCard
                className="lg:col-span-2"
                icon={<IconStats size={15} />}
                title={t("stats.trend.title")}
                sub={t("stats.trend.sub")}
              >
                <DailyChart points={dash.daily} locale={locale} />
              </StatsCard>
              <StatsCard icon={<IconSparkle size={15} />} title={t("stats.highlights.title")}>
                <Highlights items={highlights} empty={t("stats.period.empty")} />
              </StatsCard>
            </div>

            {/* Where the effort went + when it happens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <StatsCard icon={<IconMatrix size={15} />} title={t("stats.quad.title")} sub={t("stats.quad.sub")}>
                <QuadrantBreakdown breakdown={dash.quadrants} />
              </StatsCard>
              <StatsCard icon={<IconClock size={15} />} title={t("stats.heat.title")} sub={t("stats.heat.sub")}>
                <HourHeatmap heat={dash.heat} max={dash.heatMax} />
              </StatsCard>
            </div>

            {/* Projects + tags */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <StatsCard icon={<IconProject size={15} />} title={t("stats.projects.title")} sub={t("stats.projects.sub")}>
                <RankedList items={projectItems} empty={t("stats.projects.none")} />
              </StatsCard>
              <StatsCard icon={<IconNote size={15} />} title={t("stats.tags.title")} sub={t("stats.tags.sub")}>
                <RankedList items={tagItems} empty={t("stats.tags.none")} />
              </StatsCard>
            </div>

            {/* Habit week section */}
            <HabitWeekSection
              habits={habits}
              logs={habitLogs}
              weekStart={week.weekStart}
              weekEnd={week.weekEnd}
            />

            {/* All time — the long view, independent of the range above */}
            <section aria-labelledby="stats-alltime" className="surface-card p-4 sm:p-5">
              <h2 id="stats-alltime" className="text-[14px] font-semibold text-text-primary mb-3">{t("stats.alltime")}</h2>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <AllTimeFigure label={t("stats.tasks")} value={String(allTime.tasksCompleted)} />
                <AllTimeFigure label={t("stats.focus")} value={`${allFocusHours}${t("stats.hours")}`} />
                <AllTimeFigure label={t("stats.best")} value={`${allTime.bestStreak} ${t("stats.days")}`} />
                {bestHabitStreak > 0 && (
                  <AllTimeFigure label={t("stats.habit.best")} value={`${bestHabitStreak} ${t("stats.days")}`} />
                )}
              </dl>
            </section>

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
