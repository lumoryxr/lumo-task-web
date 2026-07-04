import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabitCalendarModal } from "@/components/HabitCalendarModal";
import { HabitCard } from "@/components/HabitCard";
import { HabitCheckInModal } from "@/components/HabitCheckInModal";
import { HabitFormModal } from "@/components/HabitFormModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconHabit, IconPlus } from "@/components/icons";
import { HabitListSkeleton } from "@/components/skeletons";
import { useT } from "@/i18n/useT";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import type { Habit } from "@/types/task";
import { toDateStr } from "@/utils/habits";

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-7 pt-7 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-[20px] font-semibold text-text-primary">{t("habit.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("habit.sub")}</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-text-inverse transition-opacity hover:opacity-90"
          style={{ background: "var(--accent-primary)" }}
        >
          <IconPlus size={14} />
          {t("habit.add")}
        </button>
      </div>

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto px-7 pb-6">
        {!hydrated && habits.length === 0 ? (
          <HabitListSkeleton />
        ) : habits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
            >
              <IconHabit size={24} />
            </div>
            <div>
              <p className="text-[14px] font-medium text-text-primary">{t("habit.empty.title")}</p>
              <p className="text-[12px] text-text-muted mt-1 max-w-xs">{t("habit.empty.sub")}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                logs={logs}
                onCheckIn={() => setCheckInHabit(habit)}
                onEdit={() => handleEdit(habit)}
                onDelete={() => setDeleteId(habit.id)}
                onShowCalendar={() => setCalendarHabit(habit)}
              />
            ))}
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
