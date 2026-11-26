import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { HabitCalendarModal } from "@/components/HabitCalendarModal";
import { HabitCard } from "@/components/HabitCard";
import { HabitCheckInModal } from "@/components/HabitCheckInModal";
import { HabitFormModal } from "@/components/HabitFormModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconCalendar, IconHabit, IconPlus, IconStats } from "@/components/icons";
import { HabitListSkeleton } from "@/components/skeletons";
import { useT } from "@/i18n/useT";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import type { Habit } from "@/types/task";
import { habitsOverview, isCompletedToday, isScheduledToday, toDateStr } from "@/utils/habits";
import { ProgressRing } from "@/components/ProgressRing";

export function HabitsPage() {
  const t = useT();
  const navigate = useNavigate();
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  const { habits, logs, hydrated, create, update, remove, log } = useHabitsStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Habit | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [calendarHabit, setCalendarHabit] = useState<Habit | null>(null);
  const [checkInHabit, setCheckInHabit] = useState<Habit | null>(null);

  // Auth gate
  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl"
          style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
        >
          <IconHabit size={28} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-text-primary">{t("auth.required.title")}</h2>
          <p className="mt-1 text-[13px] text-text-muted max-w-xs">{t("auth.required.habits")}</p>
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

  const today = toDateStr(new Date());

  async function handleSave(data: Omit<Habit, "id" | "createdAt">) {
    // Await the round-trip so the modal can show a spinner and only close on
    // success; a throw propagates to the modal, which keeps itself open.
    if (editTarget) {
      await update(userId, editTarget.id, data);
    } else {
      await create(userId, data);
    }
    setModalOpen(false);
    setEditTarget(null);
  }

  function handleEdit(habit: Habit) {
    setEditTarget(habit);
    setModalOpen(true);
  }

  function handleDeleteConfirm() {
    if (deleteId) {
      remove(userId, deleteId);
      setDeleteId(null);
    }
  }

  const overview = habitsOverview(habits, logs);
  // Today first (not yet done, then done), then habits resting today.
  const dueToday = habits.filter((h) => isScheduledToday(h) || isCompletedToday(h, logs));
  const todo = dueToday.filter((h) => !isCompletedToday(h, logs));
  const doneList = dueToday.filter((h) => isCompletedToday(h, logs));
  const resting = habits.filter((h) => !dueToday.includes(h));
  const pct = overview.scheduledToday ? Math.round((overview.doneToday / overview.scheduledToday) * 100) : 0;

  const card = (habit: Habit) => (
    <HabitCard
      key={habit.id}
      habit={habit}
      logs={logs}
      onCheckIn={() => setCheckInHabit(habit)}
      onEdit={() => handleEdit(habit)}
      onDelete={() => setDeleteId(habit.id)}
      onShowCalendar={() => setCalendarHabit(habit)}
    />
  );
  const grid = (list: Habit[]) => (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
      {list.map(card)}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-7 pt-6 sm:pt-7 pb-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-text-primary">{t("habit.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("habit.sub")}</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="btn btn-primary flex-shrink-0"
        >
          <IconPlus size={14} />
          {t("habit.add")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-7 pb-6">
        {!hydrated && habits.length === 0 ? (
          <HabitListSkeleton />
        ) : habits.length === 0 ? (
          <div className="surface-card flex flex-col items-center justify-center gap-3 text-center py-14 px-6">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl text-[26px]"
              style={{ background: "var(--accent-fog)" }}
              aria-hidden="true"
            >
              🌱
            </div>
            <div>
              <p className="text-[15px] font-semibold text-text-primary">{t("habit.empty.title")}</p>
              <p className="text-[12.5px] text-text-muted mt-1 max-w-xs">{t("habit.empty.sub")}</p>
            </div>
            <button
              type="button"
              className="btn btn-primary mt-1"
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
            >
              <IconPlus size={14} />
              {t("habit.add")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Today at a glance */}
            <section
              aria-label={t("habit.overview.title")}
              className="surface-card p-4 sm:p-5 grid gap-4 sm:grid-cols-[auto_1fr] items-center"
            >
              <div className="flex items-center gap-4">
                <ProgressRing pct={pct} color="var(--accent-primary)" size={64} stroke={6} />
                <div>
                  <div className="text-[22px] font-semibold text-text-primary leading-tight">
                    {overview.doneToday}
                    <span className="text-text-faint font-normal"> / {overview.scheduledToday}</span>
                  </div>
                  <div className="text-[12.5px] text-text-muted mt-0.5">
                    {overview.scheduledToday === 0
                      ? t("habit.overview.none")
                      : overview.doneToday === overview.scheduledToday
                        ? t("habit.overview.allDone")
                        : t("habit.overview.today")}
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 sm:pl-5 sm:border-l sm:border-border-faint">
                <OverviewStat
                  icon={<span aria-hidden="true">🔥</span>}
                  label={t("habit.stat.streak")}
                  value={overview.bestStreak ? `${overview.bestStreak.days} ${t("habit.days")}` : "—"}
                  sub={overview.bestStreak?.title}
                />
                <OverviewStat
                  icon={<IconCalendar size={14} />}
                  label={t("habit.stat.week")}
                  value={String(overview.weekCheckIns)}
                />
                <OverviewStat
                  icon={<IconStats size={14} />}
                  label={t("habit.stat.rate")}
                  value={`${overview.rate30}%`}
                />
              </dl>
            </section>

            {dueToday.length > 0 && (
              <section aria-label={t("habit.section.today")}>
                <SectionTitle title={t("habit.section.today")} count={`${doneList.length}/${dueToday.length}`} />
                {grid([...todo, ...doneList])}
              </section>
            )}

            {resting.length > 0 && (
              <section aria-label={t("habit.section.resting")}>
                <SectionTitle title={t("habit.section.resting")} count={String(resting.length)} />
                {grid(resting)}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Check-in modal */}
      {checkInHabit && (
        <HabitCheckInModal
          habit={checkInHabit}
          logs={logs}
          onConfirm={() => log(userId, checkInHabit.id, today)}
          onClose={() => setCheckInHabit(null)}
        />
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <HabitFormModal
          habit={editTarget}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}

      {/* Calendar modal */}
      {calendarHabit && (
        <HabitCalendarModal
          habit={calendarHabit}
          logs={logs}
          onClose={() => setCalendarHabit(null)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        danger
        title={t("habit.delete.confirm.title")}
        message={t("habit.delete.confirm")}
        confirmLabel={t("habit.menu.delete")}
        cancelLabel={t("habit.btn.cancel")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function SectionTitle({ title, count }: { title: string; count: string }) {
  return (
    <h2 className="flex items-center gap-2 mb-3 text-[14px] font-semibold text-text-primary">
      {title}
      <span className="rounded-full px-2 text-[11px] font-semibold tabular-nums leading-[20px] text-text-muted" style={{ background: "var(--bg-elevated)" }}>
        {count}
      </span>
    </h2>
  );
}

function OverviewStat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-lg px-2.5 sm:px-3 py-2.5 min-w-0" style={{ background: "var(--bg-elevated)" }}>
      <dt className="flex items-start gap-1.5 text-[11px] sm:text-[11.5px] leading-snug text-text-muted">
        <span className="hidden sm:flex text-text-faint items-center h-[1lh]">{icon}</span>
        <span className="line-clamp-2">{label}</span>
      </dt>
      <dd className="mt-auto pt-1 text-[16px] sm:text-[17px] font-semibold text-text-primary leading-tight truncate">{value}</dd>
      {sub && <dd className="text-[11px] text-text-faint truncate">{sub}</dd>}
    </div>
  );
}
