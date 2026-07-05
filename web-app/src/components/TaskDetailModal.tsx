import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { IconClose, IconCalendar, IconClock, IconArrowRight, IconCheck } from "@/components/icons";
import { TaskTitle } from "@/components/TaskTitle";
import { useT, useLocaleString } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { TaskEditModal } from "@/components/TaskEditModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fmtDuration, fmtScheduledStart, getDueLabel, getDueColor } from "@/lib/format";
import { toast } from "@/store/useToastStore";
import type { Subtask, Task } from "@/types/task";

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
  const breakdownSubtasks = useTasksStore((s) => s.breakdownSubtasks);
  const liveTask = useTasksStore((s) => s.tasks.find((tk) => tk.id === task.id) ?? task);
  const byId = usePeopleStore((s) => s.byId);
  const [editOpen, setEditOpen] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [subtaskBusy, setSubtaskBusy] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownDraft, setBreakdownDraft] = useState<string[] | null>(null);
  const [pendingSubtaskRemove, setPendingSubtaskRemove] = useState<Subtask | null>(null);
  // Deactivated while a nested modal/confirm is open so only one focus-trap runs.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, !editOpen && pendingSubtaskRemove === null);

  const assignees = (liveTask.assignee_ids ?? []).map(byId).filter(Boolean) as import("@/types/task").Person[];
  const due = getDueLabel(liveTask.due, locale);
  const dueColor = getDueColor(liveTask.due);
  const qColor = Q_COLOR[liveTask.quadrant] ?? "var(--text-faint)";
  const qLabel = locale === "zh" ? Q_LABEL_ZH[liveTask.quadrant] : Q_LABEL_EN[liveTask.quadrant];
  const subtasks: Subtask[] = liveTask.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => s.completed).length;

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
      className="fade-in fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(8,11,10,0.6)", backdropFilter: "blur(6px)", padding: "0 32px" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-x-hidden overflow-y-auto rounded-[16px] border"
        style={{
          maxWidth: 480,
          // Cap to the viewport and scroll internally so the action area stays
          // reachable on short / mobile screens (was overflow-hidden → clipped).
          maxHeight: "90vh",
          background: "var(--bg-elevated)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-lifted)",
          marginTop: "-4vh",
        }}
      >
        {/* Header — quadrant accent bar + title */}
        <div
          className="h-[3px] w-full"
          style={{ background: qColor, opacity: 0.7 }}
        />
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
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
            onClick={onClose}
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary transition-colors mt-0.5"
            aria-label={t("qc.close")}
          >
            <IconClose size={13} />
          </button>
        </header>

        {/* Meta grid */}
        <div className="px-5 pb-4 grid grid-cols-2 gap-x-6 gap-y-3">
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

          {/* Pomodoro pips */}
          {liveTask.pomos_total > 0 && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                Pomodoro
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

          {/* Assignees */}
          {assignees.length > 0 && (
            <div className="col-span-2 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)", minWidth: 64 }}>
                {t("detail.assignee")}
              </span>
              {assignees.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <PersonAvatar person={p} size={20} />
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {p.name}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>

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

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border-faint)", margin: "0 0" }} />

        {/* Footer actions */}
        <footer className="flex items-center gap-2 px-5 py-3">
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={() => { onClose(); navigate("/focus", { state: { taskId: task.id } }); }}
          >
            {t("detail.start")}
            <IconArrowRight size={13} />
          </button>

          <button
            className="btn btn-secondary flex items-center gap-1.5"
            onClick={handleComplete}
          >
            <IconCheck size={13} />
            {t("detail.complete")}
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="btn btn-ghost"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setEditOpen(true)}
          >
            {t("detail.edit")}
          </button>
        </footer>
      </div>
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
}: {
  subtask: Subtask;
  disabled?: boolean;
  onToggle: () => void;
  onDelete: () => void;
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
        className="flex-1 text-[13px] leading-snug"
        style={{
          color: subtask.completed ? "var(--text-faint)" : "var(--text-secondary)",
          textDecoration: subtask.completed ? "line-through" : "none",
        }}
      >
        {subtask.title}
      </span>
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
