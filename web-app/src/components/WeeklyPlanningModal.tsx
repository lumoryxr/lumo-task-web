import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTasksStore } from "@/store/useTasksStore";
import { useAppStore } from "@/store/useAppStore";
import { getStagnationDays, getUntouchedLabel } from "@/lib/stagnation";
import type { Task } from "@/types/task";

const MAX_WEEK_FOCUS = 3;

type StepId = "review" | "select" | "done";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekKey(date: Date): string {
  return getMondayOfWeek(date).toISOString().slice(0, 10);
}

export function getWeeklyPlanningDoneKey(): string {
  return "lumo.weekly_planning_done_week";
}

export function isWeeklyPlanned(): boolean {
  try {
    return localStorage.getItem(getWeeklyPlanningDoneKey()) === getWeekKey(new Date());
  } catch {
    return false;
  }
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export function shouldShowWeeklyBanner(): boolean {
  // Show on Monday (or if user wants to re-plan any day)
  return isMonday() || !isWeeklyPlanned();
}

// ─── Step: Review ─────────────────────────────────────────────────────────

interface ReviewStepProps {
  prevWeekFocusTasks: Task[];
  tasksCompleted: number;
  focusMinutes: number;
}

function ReviewStep({ prevWeekFocusTasks, tasksCompleted, focusMinutes }: ReviewStepProps) {
  const t = useT();
  const ls = useLocaleString();

  return (
    <div className="flex flex-col gap-5">
      {/* Stats summary */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <div
          className="rounded-xl flex flex-col gap-1"
          style={{
            padding: "14px 16px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border-faint)",
          }}
        >
          <div
            className="text-[22px] font-bold tabular-nums"
            style={{ color: "var(--accent-primary)", letterSpacing: "-0.02em" }}
          >
            {tasksCompleted}
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            {t("weekly.step.review.tasks").replace("{n}", String(tasksCompleted))}
          </div>
        </div>
        <div
          className="rounded-xl flex flex-col gap-1"
          style={{
            padding: "14px 16px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border-faint)",
          }}
        >
          <div
            className="text-[22px] font-bold tabular-nums"
            style={{ color: "var(--accent-primary)", letterSpacing: "-0.02em" }}
          >
            {focusMinutes}
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            {t("weekly.step.review.focus").replace("{n}", String(focusMinutes))}
          </div>
        </div>
      </div>

      {/* Previous week's focus tasks */}
      {prevWeekFocusTasks.length > 0 && (
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-faint)" }}
          >
            {t("weekly.step.review.prev_focus")}
          </div>
          <div className="flex flex-col gap-1.5">
            {prevWeekFocusTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2"
              >
                <div
                  className="flex-shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center"
                  style={{
                    borderColor: task.completed ? "var(--accent-primary)" : "var(--border-strong)",
                    background: task.completed ? "var(--accent-dim)" : "transparent",
                  }}
                >
                  {task.completed && (
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12l5 5 11-11" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-[13px]"
                  style={{
                    color: task.completed ? "var(--text-faint)" : "var(--text-secondary)",
                    textDecoration: task.completed ? "line-through" : "none",
                  }}
                >
                  <TaskTitle text={ls(task.title)} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tasksCompleted === 0 && prevWeekFocusTasks.length === 0 && (
        <div
          className="text-sm text-center py-4"
          style={{ color: "var(--text-faint)" }}
        >
          {t("weekly.step.review.sub")}
        </div>
      )}
    </div>
  );
}

// ─── Step: Select Focus ────────────────────────────────────────────────────

interface SelectStepProps {
  pool: Task[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function SelectStep({ pool, selected, onToggle }: SelectStepProps) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);

  if (pool.length === 0) {
    return (
      <div
        className="text-sm text-center py-6"
        style={{ color: "var(--text-faint)" }}
      >
        {t("weekly.step.select.empty")}
      </div>
    );
  }

  const selectedCount = pool.filter((tk) => selected.has(tk.id)).length;

  return (
    <div className="flex flex-col gap-2">
      {selectedCount > MAX_WEEK_FOCUS && (
        <div
          className="text-xs rounded-lg px-3 py-2 mb-1"
          style={{
            background: "var(--status-warn-bg, var(--accent-fog))",
            color: "var(--text-secondary)",
            border: "1px solid var(--accent-edge)",
          }}
        >
          {t("weekly.step.select.limit")}
        </div>
      )}

      {["Q1", "Q2"].map((quadrant) => {
        const qTasks = pool.filter((tk) => tk.quadrant === quadrant);
        if (qTasks.length === 0) return null;
        return (
          <div key={quadrant}>
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
              style={{ color: "var(--text-faint)" }}
            >
              {quadrant === "Q1" ? `Q1 — ${t("matrix.q1")}` : `Q2 — ${t("matrix.q2")}`}
            </div>
            {qTasks.map((task) => {
              const isSelected = selected.has(task.id);
              return (
                <button
                  key={task.id}
                  onClick={() => onToggle(task.id)}
                  className="w-full text-left flex items-center gap-3 rounded-lg transition-colors"
                  style={{
                    padding: "9px 10px",
                    marginBottom: 4,
                    background: isSelected ? "var(--accent-fog)" : "var(--bg-deep)",
                    border: `1px solid ${isSelected ? "var(--accent-edge)" : "var(--border-faint)"}`,
                    cursor: "pointer",
                  }}
                >
                  <div
                    className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all"
                    style={{
                      borderColor: isSelected ? "var(--accent-primary)" : "var(--border-strong)",
                      background: isSelected ? "var(--accent-primary)" : "transparent",
                    }}
                  >
                    {isSelected && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12l5 5 11-11" />
                      </svg>
                    )}
                  </div>
                  <span
                    className="text-[13px] font-medium flex-1 leading-snug"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <TaskTitle text={ls(task.title)} />
                  </span>
                  {getStagnationDays(task.updated_at) >= 7 && (
                    <span
                      className="text-[11px] flex-shrink-0 tabular-nums"
                      style={{
                        color:
                          getStagnationDays(task.updated_at) >= 14
                            ? "var(--stagnation-mid)"
                            : "var(--text-faint)",
                      }}
                    >
                      {getUntouchedLabel(getStagnationDays(task.updated_at), locale)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step: Done ────────────────────────────────────────────────────────────

interface DoneStepProps {
  focusTasks: Task[];
}

function DoneStep({ focusTasks }: DoneStepProps) {
  const t = useT();
  const ls = useLocaleString();

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="lumo-glyph" style={{ width: 40, height: 40 }}>
        <div className="halo" />
        <div className="core" />
      </div>
      <div className="text-center">
        <div
          className="font-semibold text-base mb-1"
          style={{ color: "var(--accent-primary)" }}
        >
          {t("weekly.step.done.sub")}
        </div>
      </div>
      {focusTasks.length > 0 && (
        <div className="w-full flex flex-col gap-1.5">
          {focusTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                background: "var(--accent-fog)",
                border: "1px solid var(--accent-edge)",
              }}
            >
              <span style={{ color: "var(--accent-primary)", fontSize: 13 }}>★</span>
              <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                <TaskTitle text={ls(task.title)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────

interface WeeklyPlanningModalProps {
  onClose: () => void;
  prevWeekStats: { tasksCompleted: number; focusMinutes: number };
  prevWeekFocusTasks: Task[];
}

export function WeeklyPlanningModal({ onClose, prevWeekStats, prevWeekFocusTasks }: WeeklyPlanningModalProps) {
  const t = useT();
  const tasks = useTasksStore((s) => s.tasks);
  const update = useTasksStore((s) => s.update);

  const steps: StepId[] = ["review", "select", "done"];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  // Q1 + Q2 pool, sorted by quadrant, then by stagnation (longest-untouched
  // first — #187), with conviction as the tiebreaker.
  const pool = useMemo(
    () =>
      tasks
        .filter((tk) => !tk.completed && (tk.quadrant === "Q1" || tk.quadrant === "Q2"))
        .sort((a, b) => {
          if (a.quadrant !== b.quadrant) return a.quadrant === "Q1" ? -1 : 1;
          const stagDiff = getStagnationDays(b.updated_at) - getStagnationDays(a.updated_at);
          if (stagDiff !== 0) return stagDiff;
          return (b.conviction ?? 0) - (a.conviction ?? 0);
        }),
    [tasks]
  );

  // Pre-select existing week_focus tasks
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(tasks.filter((tk) => tk.week_focus && !tk.completed).map((tk) => tk.id))
  );

  const [busy, setBusy] = useState(false);

  function handleTaskToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      // Clear week_focus from all tasks not in the new selection
      for (const tk of tasks.filter((t) => t.week_focus && !selected.has(t.id))) {
        await update(tk.id, { week_focus: false });
      }
      // Set week_focus on selected tasks
      for (const id of selected) {
        const task = tasks.find((tk) => tk.id === id);
        if (task && !task.week_focus) {
          await update(id, { week_focus: true });
        }
      }
      localStorage.setItem(getWeeklyPlanningDoneKey(), getWeekKey(new Date()));
      onClose();
    } catch {
      // Store already surfaces a toast; leave modal open for retry.
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (step === "done") {
      finish();
    } else if (stepIdx < steps.length - 1) {
      setStepIdx((s) => s + 1);
    }
  }

  function goBack() {
    if (stepIdx > 0) setStepIdx((s) => s - 1);
  }

  const isLastStep = step === "done";
  const selectedCount = pool.filter((tk) => selected.has(tk.id)).length;
  const focusTasks = tasks.filter((tk) => selected.has(tk.id));

  const stepLabel = t("weekly.progress")
    .replace("{step}", String(stepIdx + 1))
    .replace("{total}", String(steps.length));

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
      tabIndex={-1}
      aria-label={t("weekly.title")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--border-faint)",
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-1.5" style={{ flex: 1 }}>
            {steps.map((s, i) => (
              <div
                key={s}
                style={{
                  width: i === stepIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i <= stepIdx ? "var(--accent-primary)" : "var(--border-default)",
                  transition: "all 0.25s",
                }}
              />
            ))}
          </div>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: "var(--text-faint)", flexShrink: 0 }}
          >
            {stepLabel}
          </span>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-faint)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 4px 4px 8px",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Step title */}
        <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
          <h2
            className="font-semibold"
            style={{ fontSize: 17, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {step === "review" && t("weekly.step.review.title")}
            {step === "select" && t("weekly.step.select.title")}
            {step === "done" && t("weekly.step.done.title")}
          </h2>
          {step === "select" && (
            <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
              {t("weekly.step.select.sub")}
            </p>
          )}
        </div>

        {/* Step content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 20px 0",
          }}
        >
          {step === "review" && (
            <ReviewStep
              prevWeekFocusTasks={prevWeekFocusTasks}
              tasksCompleted={prevWeekStats.tasksCompleted}
              focusMinutes={prevWeekStats.focusMinutes}
            />
          )}
          {step === "select" && (
            <SelectStep pool={pool} selected={selected} onToggle={handleTaskToggle} />
          )}
          {step === "done" && <DoneStep focusTasks={focusTasks} />}
        </div>

        {/* Footer navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 20px",
            borderTop: "1px solid var(--border-faint)",
            flexShrink: 0,
          }}
        >
          {stepIdx > 0 && !isLastStep && (
            <button
              onClick={goBack}
              disabled={busy}
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
            >
              {t("planning.btn.back")}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === "select" && selectedCount > 0 && (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              {t("weekly.selected").replace("{n}", String(selectedCount))}
            </span>
          )}
          <button
            onClick={goNext}
            disabled={busy}
            className="btn btn-primary"
            style={{ minHeight: 44, minWidth: 100 }}
          >
            {busy ? "…" : isLastStep ? t("weekly.btn.finish") : t("planning.btn.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
