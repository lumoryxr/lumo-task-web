import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { IconClose, IconCalendar, IconClock, IconArrowRight, IconCheck, IconChevronRight, IconEdit, IconNote, IconProject, IconRepeat } from "@/components/icons";
import { TaskTitle } from "@/components/TaskTitle";
import { useT, useLocaleString } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { TaskEditModal } from "@/components/TaskEditModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TaskProgressBar, TaskProgressEditor } from "@/components/TaskProgress";
import { StageTrack } from "@/components/StageTrack";
import { TaskProgressDrawer } from "@/components/TaskProgressDrawer";
import { useProjectsStore } from "@/store/useProjectsStore";
import { clampProgress } from "@/lib/progress";
import { fmtDuration, fmtScheduledStart, getDueLabel, getDueColor } from "@/lib/format";
import { toast } from "@/store/useToastStore";
import type { Person, Subtask, Task } from "@/types/task";

const Q_COLOR: Record<string, string> = {
  Q1: "var(--q1-color)",
  Q2: "var(--q2-color)",
  Q3: "var(--q3-color)",
  Q4: "var(--q4-color)",
  unclassified: "var(--text-faint)",
};

const Q_LABEL_EN: Record<string, string> = {
  Q1: "Urgent · Important",
  Q2: "Important · Not urgent",
  Q3: "Urgent · Not important",
  Q4: "Neither",
  unclassified: "Unclassified",
};

const Q_LABEL_ZH: Record<string, string> = {
  Q1: "紧急 · 重要",
  Q2: "重要 · 不紧急",
  Q3: "紧急 · 不重要",
  Q4: "都不是",
  unclassified: "未分类",
};

interface Props {
  task: Task;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: Props) {
  const t = useT();
  const ls = useLocaleString();
  const navigate = useNavigate();
  const locale = useAppStore((s) => s.locale);
  const complete = useTasksStore((s) => s.complete);
  const addSubtask = useTasksStore((s) => s.addSubtask);
  const toggleSubtask = useTasksStore((s) => s.toggleSubtask);
  const deleteSubtask = useTasksStore((s) => s.deleteSubtask);
  const setSubtaskAssignee = useTasksStore((s) => s.setSubtaskAssignee);
  const people = usePeopleStore((s) => s.people);
  const breakdownSubtasks = useTasksStore((s) => s.breakdownSubtasks);
  const update = useTasksStore((s) => s.update);
  const liveTask = useTasksStore((s) => s.tasks.find((tk) => tk.id === task.id) ?? task);
  const byId = usePeopleStore((s) => s.byId);
  const [editOpen, setEditOpen] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownDraft, setBreakdownDraft] = useState<string[] | null>(null);
  const [pendingSubtaskRemove, setPendingSubtaskRemove] = useState<Subtask | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  // Deactivated while a nested modal/confirm is open so only one focus-trap runs.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, !editOpen && pendingSubtaskRemove === null && !progressOpen);

  const assignees = (liveTask.assignee_ids ?? []).map(byId).filter(Boolean) as import("@/types/task").Person[];
  const progressLog = liveTask.progress_log ?? [];
  const latestNote = progressLog.reduce<(typeof progressLog)[number] | null>(
    (best, n) => (!best || n.date > best.date || (n.date === best.date && n.created_at > best.created_at) ? n : best),
    null,
  );
  const due = getDueLabel(liveTask.due, locale);
  const dueColor = getDueColor(liveTask.due);
  const qColor = Q_COLOR[liveTask.quadrant] ?? "var(--text-faint)";
  const qLabel = locale === "zh" ? Q_LABEL_ZH[liveTask.quadrant] : Q_LABEL_EN[liveTask.quadrant];
  const subtasks: Subtask[] = liveTask.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => s.completed).length;

  // Progress is edited in place: the draft follows the slider, and a finished
  // edit (release / preset / shortcut) saves it. A failed save reverts.
  const savedProgress = clampProgress(liveTask.progress);
  const [progressDraft, setProgressDraft] = useState(savedProgress);
  const [progressSaving, setProgressSaving] = useState(false);
  useEffect(() => { setProgressDraft(savedProgress); }, [savedProgress]);

  // Stage: the owning project's track, clicked to move the task along it.
  const projectStages =
    useProjectsStore((s) => s.projects.find((p) => p.id === liveTask.project_id)?.stages) ?? [];
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === liveTask.project_id)?.name);
  const currentStageId = projectStages.some((s) => s.id === liveTask.stage_id) ? liveTask.stage_id ?? null : null;
  const [stageSaving, setStageSaving] = useState(false);

  async function commitStage(stageId: string | null) {
    if (stageId === currentStageId || stageSaving) return;
    setStageSaving(true);
    try {
      await update(liveTask.id, { stage_id: stageId });
    } catch {
      // The store already surfaced the error toast; the track keeps the saved stage.
    } finally {
      setStageSaving(false);
    }
  }

  async function commitProgress(value: number) {
    if (value === savedProgress || progressSaving) return;
    setProgressSaving(true);
    try {
      await update(liveTask.id, { progress: value });
    } catch {
      // The store already surfaced the error toast; snap back to the saved value.
      setProgressDraft(savedProgress);
    } finally {
      setProgressSaving(false);
    }
  }

  async function handleAddSubtask() {
    const title = subtaskInput.trim();
    if (!title || subtaskBusy) return;
    setSubtaskInput("");
    setSubtaskBusy(true);
    try {
      await addSubtask(liveTask.id, title);
    } finally {
      setSubtaskBusy(false);
      subtaskInputRef.current?.focus();
    }
  }

  async function handleComplete() {
    await complete(task.id);
    onClose();
  }

  async function handleAIBreakdown() {
    if (breakdownLoading) return;
    setBreakdownLoading(true);
    try {
      const result = await breakdownSubtasks(liveTask.id, locale);
      if (result.cloudLimitReached) {
        toast.error(t("detail.ai.breakdown.quota"));
        return;
      }
      setBreakdownDraft(result.subtasks);
    } catch {
      toast.error(t("detail.ai.breakdown.error"));
    } finally {
      setBreakdownLoading(false);
    }
  }

  async function handleConfirmBreakdown() {
    if (!breakdownDraft || subtaskBusy) return;
    const titles = breakdownDraft.filter((s) => s.trim().length > 0);
    if (titles.length === 0) return;
    setSubtaskBusy(true);
    try {
      await Promise.all(titles.map((title) => addSubtask(liveTask.id, title)));
    } catch {
      toast.error(t("detail.ai.breakdown.error"));
    } finally {
      setBreakdownDraft(null);
      setSubtaskBusy(false);
    }
  }


  if (editOpen) {
    return <TaskEditModal task={task} onClose={() => { setEditOpen(false); onClose(); }} />;
  }

  return createPortal(
    <div
      onClick={onClose}
      className="task-dialog-backdrop fade-in z-[200]"
      style={{ background: "rgba(8,11,10,0.6)", backdropFilter: "blur(6px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="task-dialog task-dialog--detail rounded-[16px] border"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-lifted)",
        }}
      >
        {/* Header — quadrant accent bar + title; stays put while the body scrolls */}
        <header
          className="flex items-start gap-3 px-5 pt-4 pb-3"
          style={{ boxShadow: `inset 0 3px 0 color-mix(in srgb, ${qColor} 70%, transparent)` }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-block rounded-full flex-shrink-0"
                style={{ width: 7, height: 7, background: qColor }}
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: qColor }}>
                {liveTask.quadrant === "unclassified" ? (locale === "zh" ? "未分类" : "Unclassified") : liveTask.quadrant}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>·</span>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{qLabel}</span>
            </div>
            <h2
              className="font-semibold leading-snug"
              style={{ fontSize: 17, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
            >
              <TaskTitle text={ls(liveTask.title)} />
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={t("detail.edit")}
            title={t("detail.edit")}
            className="flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-medium text-text-secondary border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary transition-colors mt-0.5"
          >
            <IconEdit size={12} />
            <span className="hidden sm:inline">{t("detail.edit")}</span>
          </button>
          <button
            onClick={onClose}
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary transition-colors mt-0.5"
            aria-label={t("qc.close")}
          >
            <IconClose size={13} />
          </button>
        </header>

        {/* Body — the only part that scrolls */}
        <div className="task-dialog__body">

        {/* Description */}
        {liveTask.desc && ls(liveTask.desc).trim() && (
          <p className="mx-5 mb-4 mt-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {ls(liveTask.desc)}
          </p>
        )}

        {/* Properties — label / value pairs, two columns where there is room */}
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {/* Scheduled time */}
          {liveTask.scheduled_start && (
            <MetaRow
              icon={<IconCalendar size={13} />}
              label={t("detail.scheduledAt")}
              value={fmtScheduledStart(liveTask.scheduled_start, locale)}
            />
          )}

          {/* Due date */}
          {due && (
            <MetaRow
              icon={<IconCalendar size={13} />}
              label={t("detail.due")}
              value={due}
              valueColor={dueColor}
            />
          )}

          {/* Duration */}
          <MetaRow
            icon={<IconClock size={13} />}
            label={t("detail.estimate")}
            value={fmtDuration(liveTask.duration, locale)}
          />

          {/* Repeat */}
          {liveTask.recurrence && liveTask.recurrence !== "none" && (
            <MetaRow
              icon={<IconRepeat size={13} />}
              label={t("task.recurrence")}
              value={t(`task.recurrence.${liveTask.recurrence}`)}
            />
          )}

          {/* Project */}
          {projectName && (
            <MetaRow icon={<IconProject size={13} />} label={t("project.select.label")} value={projectName} />
          )}

          {/* Tags */}
          {(liveTask.tags ?? []).length > 0 && (
            <div className="sm:col-span-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                {t("edit.tags")}
              </span>
              {(liveTask.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded px-1.5 py-px text-[11px] font-medium"
                  style={{ color: "var(--accent-primary)", background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Pomodoro pips */}
          {liveTask.pomos_total > 0 && (
            <div className="sm:col-span-2 flex items-center gap-2">
              <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                {t("detail.pomodoro")}
              </span>
              <span className="pip">
                {Array.from({ length: liveTask.pomos_total }).map((_, i) => (
                  <i key={i} className={i < liveTask.pomos_done ? "on" : ""} />
                ))}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                {liveTask.pomos_done}/{liveTask.pomos_total}
              </span>
            </div>
          )}

          {/* Assignees: the primary (主责任人) stands out on its own line; the
              others are listed beneath it. Rows elsewhere show only the primary. */}
          {assignees.length > 0 && (
            <div className="sm:col-span-2 flex flex-col gap-1.5">
              <div data-testid="assignee-primary" className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-medium flex-shrink-0" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                  {t("assignee.primaryLabel")}
                </span>
                <PersonAvatar person={assignees[0]} size={22} />
                <span className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {assignees[0].name}
                </span>
              </div>
              {assignees.length > 1 && (
                <div data-testid="assignee-others" className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium flex-shrink-0" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                    {t("assignee.others")}
                  </span>
                  {assignees.slice(1).map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5">
                      <PersonAvatar person={p} size={18} />
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                        {p.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Progress: the stage in the project's workflow, then the completion % */}
        <section
          aria-label={t("progress.card")}
          className="mx-5 mb-4 rounded-xl border px-3.5 pt-3 pb-3.5"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-faint)" }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-2.5" style={{ color: "var(--text-faint)" }}>
            {t("progress.card")}
          </div>
          {projectStages.length > 0 && (
            <div className="mb-3.5 pb-3.5" style={{ borderBottom: "1px solid var(--border-faint)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  {t("stage.label")}
                  {stageSaving && (
                    <span className="ml-2 text-[11px]" style={{ color: "var(--text-faint)" }} aria-live="polite">
                      {t("progress.saving")}
                    </span>
                  )}
                </span>
                {currentStageId && (
                  <button
                    type="button"
                    disabled={stageSaving}
                    onClick={() => commitStage(null)}
                    className="text-[11px] text-text-faint hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    {t("stage.clear")}
                  </button>
                )}
              </div>
              {!currentStageId && (
                <p className="text-[11.5px] mb-2" style={{ color: "var(--text-faint)" }}>{t("stage.none")}</p>
              )}
              <StageTrack
                stages={projectStages}
                currentId={currentStageId}
                onSelect={commitStage}
                busy={stageSaving}
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
              {t("progress.completion")}
            </span>
            <div className="flex-1 min-w-0">
              {!adjusting && <TaskProgressBar value={progressDraft} size="md" />}
            </div>
            <button
              type="button"
              onClick={() => setAdjusting((v) => !v)}
              aria-expanded={adjusting}
              className="flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors"
              style={{ border: "1px solid var(--border-default)" }}
            >
              {adjusting ? t("progress.adjustDone") : t("progress.adjust")}
            </button>
          </div>
          {adjusting && (
            <div className="mt-3">
              <TaskProgressEditor
                value={progressDraft}
                onChange={setProgressDraft}
                onCommit={commitProgress}
                subtasks={subtasks}
                busy={progressSaving}
              />
            </div>
          )}
        </section>

        {/* Progress updates (进展记录): one line here; the full log is its own panel */}
        <button
          type="button"
          onClick={() => setProgressOpen(true)}
          aria-label={t("progressLog.openCount").replace("{n}", String(progressLog.length))}
          className="mx-5 mb-5 flex w-[calc(100%-2.5rem)] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
          style={{ borderColor: "var(--border-faint)", background: "var(--bg-surface)" }}
        >
          <span className="flex-shrink-0" style={{ color: "var(--accent-primary)" }}><IconNote size={15} /></span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
              {t("progressLog.title")}
              {progressLog.length > 0 && <span className="font-normal tabular-nums text-text-faint">{progressLog.length}</span>}
            </span>
            <span className="block truncate text-[12.5px]" style={{ color: latestNote ? "var(--text-primary)" : "var(--text-faint)" }}>
              {latestNote ? `${latestNote.date.slice(5).replace("-", "/")} · ${latestNote.text}` : t("progressLog.none")}
            </span>
          </span>
          <span className="flex-shrink-0 flex items-center gap-0.5 text-[11.5px] text-text-muted">
            {latestNote ? t("progressLog.view") : t("progressLog.addShort")}
            <IconChevronRight size={12} />
          </span>
        </button>

        {/* Subtasks */}
        <div className="mx-5 mb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-faint)" }}>
                {t("detail.subtasks")}
                {subtasks.length > 0 && (
                  <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                    {subtasksDone}/{subtasks.length}
                  </span>
                )}
              </span>
              {/* AI breakdown button — only shown when no subtasks and no draft */}
              {subtasks.length === 0 && breakdownDraft === null && (
                <button
                  onClick={handleAIBreakdown}
                  disabled={breakdownLoading}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-opacity"
                  style={{
                    background: "var(--accent-fog)",
                    border: "1px solid var(--accent-edge)",
                    color: "var(--accent-primary)",
                    opacity: breakdownLoading ? 0.7 : 1,
                    cursor: breakdownLoading ? "default" : "pointer",
                  }}
                >
                  {breakdownLoading ? t("detail.ai.breakdown.loading") : t("detail.ai.breakdown")}
                </button>
              )}
            </div>

            {/* Progress bar */}
            {subtasks.length > 0 && (
              <div className="h-[3px] rounded-full mb-3 overflow-hidden" style={{ background: "var(--border-faint)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(subtasksDone / subtasks.length) * 100}%`,
                    background: "var(--accent-primary)",
                  }}
                />
              </div>
            )}

            {/* Subtask list */}
            {subtasks.map((sub) => (
              <SubtaskItem
                key={sub.id}
                subtask={sub}
                disabled={subtaskBusy}
                onToggle={async () => {
                  if (subtaskBusy) return;
                  setSubtaskBusy(true);
                  try { await toggleSubtask(liveTask.id, sub.id); } finally { setSubtaskBusy(false); }
                }}
                onDelete={() => setPendingSubtaskRemove(sub)}
                people={people}
                assignee={sub.assignee_id ? byId(sub.assignee_id) : undefined}
                onAssign={async (personId) => {
                  if (subtaskBusy) return;
                  setSubtaskBusy(true);
                  try {
                    await setSubtaskAssignee(liveTask.id, sub.id, personId);
                  } catch {
                    toast.error(t("detail.subtask.assignError"));
                  } finally {
                    setSubtaskBusy(false);
                  }
                }}
              />
            ))}

            {/* AI breakdown draft preview */}
            {breakdownDraft !== null && (() => {
              const confirmDisabled = subtaskBusy || breakdownDraft.filter((s) => s.trim()).length === 0;
              return (
              <div className="mb-3">
                {breakdownDraft.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 py-1">
                    <div
                      className="flex-shrink-0 w-[16px] h-[16px] rounded-full border-[1.5px] flex items-center justify-center"
                      style={{ borderColor: "var(--accent-primary)", borderStyle: "dashed" }}
                    />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const next = [...breakdownDraft];
                        next[idx] = e.target.value;
                        setBreakdownDraft(next);
                      }}
                      className="flex-1 text-[13px] bg-transparent outline-none"
                      style={{ color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={() => {
                        const next = breakdownDraft.filter((_, i) => i !== idx);
                        setBreakdownDraft(next.length > 0 ? next : null);
                      }}
                      className="flex-shrink-0 text-[11px] w-[18px] h-[18px] flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
                      style={{ color: "var(--text-faint)", background: "var(--bg-subtle)" }}
                      aria-label={t("detail.breakdown.remove")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleConfirmBreakdown}
                    disabled={confirmDisabled}
                    className="text-[11px] px-3 py-1 rounded-md font-medium transition-opacity"
                    style={{
                      background: "var(--accent-primary)",
                      color: "var(--bg-default)",
                      opacity: confirmDisabled ? 0.4 : 1,
                    }}
                  >
                    {t("detail.ai.breakdown.confirm")}
                  </button>
                  <button
                    onClick={() => setBreakdownDraft(null)}
                    disabled={subtaskBusy}
                    className="text-[11px] px-3 py-1 rounded-md transition-opacity"
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--border-faint)",
                      color: "var(--text-secondary)",
                      opacity: subtaskBusy ? 0.4 : 1,
                    }}
                  >
                    {t("detail.ai.breakdown.cancel")}
                  </button>
                </div>
              </div>
              );
            })()}

            {/* Add subtask input */}
            <div className="flex items-center gap-2 mt-2">
              <div
                className="flex-shrink-0 w-[16px] h-[16px] rounded-full border-[1.5px] flex items-center justify-center"
                style={{ borderColor: "var(--border-default)", borderStyle: "dashed" }}
              />
              <input
                ref={subtaskInputRef}
                type="text"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddSubtask(); }
                }}
                aria-label={t("detail.subtask.add")}
                placeholder={t("detail.subtask.add")}
                disabled={subtaskBusy}
                className="flex-1 text-[13px] bg-transparent outline-none"
                style={{ color: "var(--text-secondary)" }}
              />
              {subtaskInput.trim() && (
                <button
                  onClick={handleAddSubtask}
                  disabled={subtaskBusy}
                  className="text-[11px] px-2 py-0.5 rounded-md"
                  style={{
                    background: "var(--accent-fog)",
                    border: "1px solid var(--accent-edge)",
                    color: "var(--accent-primary)",
                    opacity: subtaskBusy ? 0.5 : 1,
                  }}
                >
                  {t("detail.subtask.add.btn")}
                </button>
              )}
            </div>
          </div>

        {/* Next step */}
        {liveTask.next_step && (
          <div
            className="mx-5 mb-4 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border-faint)",
              color: "var(--text-secondary)",
            }}
          >
            <span className="font-medium" style={{ color: "var(--text-faint)" }}>
              {t("detail.nextstep")} ·{" "}
            </span>
            {ls(liveTask.next_step)}
          </div>
        )}

        </div>

        {/* Footer actions — always in view; the main action sits on the right */}
        <footer className="flex items-center gap-2 px-5 py-3 border-t border-border-faint">
          <button
            className="btn btn-secondary flex items-center gap-1.5"
            onClick={handleComplete}
          >
            <IconCheck size={13} />
            {t("detail.complete")}
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={() => { onClose(); navigate("/focus", { state: { taskId: task.id } }); }}
          >
            {t("detail.start")}
            <IconArrowRight size={13} />
          </button>
        </footer>
      </div>
      {progressOpen && <TaskProgressDrawer task={liveTask} onClose={() => setProgressOpen(false)} />}
      <ConfirmDialog
        open={pendingSubtaskRemove !== null}
        danger
        title={t("detail.subtask.delete.confirm.title")}
        message={t("detail.subtask.delete.confirm")}
        detail={pendingSubtaskRemove?.title}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          const target = pendingSubtaskRemove;
          setPendingSubtaskRemove(null);
          if (!target || subtaskBusy) return;
          setSubtaskBusy(true);
          try { await deleteSubtask(liveTask.id, target.id); } finally { setSubtaskBusy(false); }
        }}
        onCancel={() => setPendingSubtaskRemove(null)}
      />
    </div>,
    document.body
  );
}

function MetaRow({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "var(--text-faint)" }}>{icon}</span>
      <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)", minWidth: 40 }}>{label}</span>
      <span className="text-[12px] font-medium" style={{ color: valueColor ?? "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

function SubtaskItem({
  subtask,
  disabled,
  onToggle,
  onDelete,
  people,
  assignee,
  onAssign,
}: {
  subtask: Subtask;
  disabled?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  people: Person[];
  assignee: Person | undefined;
  onAssign: (personId: string | null) => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2 py-1.5 rounded-md group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onToggle}
        disabled={disabled}
        className="flex-shrink-0 flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.5px] transition-all"
        style={{
          borderColor: subtask.completed ? "var(--accent-primary)" : "var(--border-strong)",
          background: subtask.completed ? "var(--accent-fog)" : "transparent",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {subtask.completed && <IconCheck size={9} strokeWidth={2.5} style={{ color: "var(--accent-primary)" }} />}
      </button>
      <span
        className="flex-1 min-w-0 text-[13px] leading-snug"
        style={{
          color: subtask.completed ? "var(--text-faint)" : "var(--text-secondary)",
          textDecoration: subtask.completed ? "line-through" : "none",
        }}
      >
        {subtask.title}
      </span>
      {(people.length > 0 || assignee) && (
        <SubtaskAssigneePicker
          title={subtask.title}
          people={people}
          assignee={assignee}
          disabled={disabled}
          reveal={hovered}
          onAssign={onAssign}
        />
      )}
      {hovered && !disabled && (
        <button
          onClick={onDelete}
          aria-label={t("detail.subtask.delete")}
          className="flex-shrink-0 flex items-center justify-center w-[16px] h-[16px] rounded transition-colors"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--status-urgent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}
        >
          <IconClose size={10} />
        </button>
      )}
    </div>
  );
}

/**
 * One-person picker for a subtask: the owner's avatar (or a faint "+" slot
 * revealed on hover) opens a small menu of people plus "Unassigned".
 */
function SubtaskAssigneePicker({
  title,
  people,
  assignee,
  disabled,
  reveal,
  onAssign,
}: {
  title: string;
  people: Person[];
  assignee: Person | undefined;
  disabled?: boolean;
  /** Row is hovered: show the empty slot so it can be found. */
  reveal: boolean;
  onAssign: (personId: string | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Where the menu opens: below the avatar unless the dialog has no room there.
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number }>({ up: false, maxHeight: 220 });
  const wrapRef = useRef<HTMLDivElement>(null);

  function toggleOpen() {
    if (!open && wrapRef.current) {
      const trigger = wrapRef.current.getBoundingClientRect();
      const bounds = wrapRef.current.closest("[role='dialog']")?.getBoundingClientRect();
      const top = bounds?.top ?? 0;
      const bottom = bounds?.bottom ?? window.innerHeight;
      const wanted = Math.min(220, 12 + (people.length + 1) * 32);
      const below = bottom - trigger.bottom - 8;
      const above = trigger.top - top - 8;
      const up = below < wanted && above > below;
      // jsdom reports zero-sized rects: fall back to the full height there.
      const room = up ? above : below;
      setPlacement({ up, maxHeight: room > 0 ? Math.min(220, room) : 220 });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(personId: string | null) {
    setOpen(false);
    if (personId !== (assignee?.id ?? null)) onAssign(personId);
  }

  const label = assignee
    ? t("detail.subtask.assignee").replace("{title}", title).replace("{name}", assignee.name)
    : t("detail.subtask.assign").replace("{title}", title);
  const visible = Boolean(assignee) || reveal || open;

  return (
    <div
      ref={wrapRef}
      className="relative flex-shrink-0"
      onKeyDown={(e) => {
        // Close just the menu, not the whole detail modal.
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={assignee?.name ?? t("detail.subtask.unassigned")}
        onClick={toggleOpen}
        className="flex items-center justify-center rounded-full transition-opacity disabled:opacity-50 focus-visible:opacity-100"
        style={{ opacity: visible ? 1 : 0, width: 18, height: 18 }}
      >
        {assignee ? (
          <PersonAvatar person={assignee} size={18} />
        ) : (
          <span
            className="flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] leading-none"
            style={{ border: "1px dashed var(--border-strong)", color: "var(--text-faint)" }}
          >
            +
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-20 min-w-[160px] overflow-y-auto rounded-lg py-1 ${placement.up ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]"}`}
          style={{
            maxHeight: placement.maxHeight,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lifted)",
          }}
        >
          {[{ id: null, person: undefined as Person | undefined }, ...people.map((p) => ({ id: p.id as string | null, person: p }))].map(
            ({ id, person }) => {
              const checked = (assignee?.id ?? null) === id;
              return (
                <button
                  key={id ?? "__none"}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  onClick={() => pick(id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-subtle transition-colors"
                  style={{ color: checked ? "var(--accent-primary)" : "var(--text-secondary)" }}
                >
                  {person ? (
                    <span aria-hidden="true"><PersonAvatar person={person} size={18} /></span>
                  ) : (
                    <span
                      className="w-[18px] h-[18px] rounded-full flex-shrink-0"
                      style={{ border: "1px dashed var(--border-strong)" }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex-1 truncate">{person ? person.name : t("detail.subtask.unassigned")}</span>
                  {checked && <IconCheck size={11} strokeWidth={2.5} />}
                </button>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
