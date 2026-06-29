import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { TagInput } from "@/components/TagInput";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { toISODate } from "@/lib/format";
import type { Quadrant, Task, TaskRecurrence } from "@/types/task";

interface Props {
  task: Task;
  onClose: () => void;
}

const QUADRANTS: Quadrant[] = ["Q1", "Q2", "Q3", "Q4"];

const RECURRENCE_VALUES: TaskRecurrence[] = ["none", "daily", "weekdays", "weekly", "monthly"];

const Q_META: Record<Quadrant, { en: string; zh: string; descEn: string; descZh: string }> = {
  Q1:           { en: "Do first",  zh: "立即做", descEn: "Urgent & important",    descZh: "紧急 + 重要" },
  Q2:           { en: "Schedule",  zh: "安排做", descEn: "Important, not urgent", descZh: "重要，不紧急" },
  Q3:           { en: "Delegate",  zh: "委托做", descEn: "Urgent, not important", descZh: "紧急，不重要" },
  Q4:           { en: "Drop",      zh: "减少做", descEn: "Neither",               descZh: "都不是" },
  unclassified: { en: "Unsorted",  zh: "未分类", descEn: "Not yet placed",        descZh: "尚未归位" },
};

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysUntil = ((8 - day) % 7) || 7;
  return toISODate(new Date(d.getTime() + daysUntil * 86400000));
}

export function TaskEditModal({ task, onClose }: Props) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const update = useTasksStore((s) => s.update);
  const remove = useTasksStore((s) => s.remove);
  const people = usePeopleStore((s) => s.people);

  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
  const nextWeekISO = getNextMonday();

  const initialTitle =
    typeof task.title === "string" ? task.title : (task.title as { en: string }).en;

  const initialDesc =
    task.desc ? (typeof task.desc === "string" ? task.desc : (task.desc as { en: string }).en) : "";

  // datetime-local requires "YYYY-MM-DDTHH:MM" — strip seconds if present
  const initialScheduledStart = task.scheduled_start
    ? task.scheduled_start.slice(0, 16)
    : "";
  const initialRemindAt = task.remind_at ? task.remind_at.slice(0, 16) : "";

  const [title, setTitle] = useState(initialTitle);
  const [desc, setDesc] = useState(initialDesc);
  const [quadrant, setQuadrant] = useState<Task["quadrant"]>(task.quadrant);
  const [duration, setDuration] = useState(task.duration);
  const [durationRaw, setDurationRaw] = useState(String(task.duration));
  const [dueDate, setDueDate] = useState<string>(
    task.due === "today" ? todayISO : (task.due ?? "")
  );
  const [scheduledStart, setScheduledStart] = useState<string>(initialScheduledStart);
  const [remindAt, setRemindAt] = useState<string>(initialRemindAt);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(task.recurrence ?? "none");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assignee_ids ?? []);
  const [tags, setTags] = useState<string[]>(task.tags ?? []);
  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // Esc / focus-trap / focus-return come from the shared hook; this keeps the
  // Cmd/Ctrl+Enter save shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSave() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await update(task.id, {
        title: { en: title.trim(), zh: title.trim() },
        desc: desc.trim() ? { en: desc.trim(), zh: desc.trim() } : null,
        quadrant: quadrant as Task["quadrant"],
        duration,
        pomos_total: Math.max(1, Math.ceil(duration / 25)),
        due: dueDate || null,
        scheduled_start: scheduledStart || null,
        remind_at: remindAt || null,
        recurrence,
        assignee_ids: assigneeIds,
        tags,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy(true);
    try {
      await remove(task.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      className="fade-in fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(8, 11, 10, 0.65)", backdropFilter: "blur(6px)", padding: "0 32px" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-hidden border rounded-[14px]"
        style={{
          maxWidth: 520,
          background: "var(--bg-elevated)",
          borderColor: "var(--accent-edge)",
          boxShadow: "var(--shadow-lifted), 0 0 60px var(--accent-fog)",
          marginTop: "-6vh",
        }}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-[18px] py-4 border-b border-border-faint">
          <div className="flex-1 text-[13px] font-semibold text-text-primary">{t("edit.title")}</div>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <IconClose size={12} />
          </button>
        </header>

        {/* Body */}
        <div className="px-[18px] py-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {/* Title */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
              {locale === "zh" ? "任务" : "Task"}
            </div>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("qc.placeholder")}
              className="input"
              style={{ height: 40, fontSize: 14, fontWeight: 500 }}
            />
          </div>

          {/* Quadrant 2×2 grid */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-2">
              {t("qc.quadrant")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {QUADRANTS.map((q) => {
                const meta = Q_META[q];
                const active = quadrant === q;
                return (
                  <button
                    key={q}
                    onClick={() => setQuadrant(q)}
                    className="text-left rounded-lg border transition-colors"
                    style={{
                      padding: "9px 11px",
                      background: active ? "var(--bg-subtle)" : "var(--bg-surface)",
                      borderColor: active ? "var(--border-strong)" : "var(--border-default)",
                      boxShadow: active ? "0 0 0 1px var(--border-strong)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`qdot qdot-${q.toLowerCase()}`} />
                      <span className="text-[11px] font-semibold text-text-primary">{q}</span>
                      <span
                        className="text-[11px] font-medium ml-1"
                        style={{ color: `var(--q${q[1]}-color, var(--text-muted))` }}
                      >
                        {locale === "zh" ? meta.zh : meta.en}
                      </span>
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {locale === "zh" ? meta.descZh : meta.descEn}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
              {t("edit.desc")}
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("edit.desc.placeholder")}
              rows={3}
              className="input resize-none"
              style={{ fontSize: 13, paddingTop: 8, paddingBottom: 8, lineHeight: "1.5" }}
            />
          </div>

          {/* Due + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                  {t("qc.due")}
                </div>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate("")}
                    className="text-[10px] transition-colors"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("due.none")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {([
                  { label: t("due.today"), value: todayISO },
                  { label: t("due.tomorrow"), value: tomorrowISO },
                  { label: t("due.nextWeek"), value: nextWeekISO },
                ]).map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDueDate(value)}
                    className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
                    style={{
                      background: dueDate === value ? "var(--accent-fog)" : "var(--bg-surface)",
                      border: `1px solid ${dueDate === value ? "var(--accent-edge)" : "var(--border-default)"}`,
                      color: dueDate === value ? "var(--accent-primary)" : "var(--text-muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input"
                style={{ colorScheme: "dark", cursor: "pointer" }}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                {t("qc.duration")}
              </div>
              <div
                className="flex items-center rounded-md border overflow-hidden"
                style={{ height: 36, borderColor: "var(--border-default)", background: "var(--bg-surface)" }}
              >
                <button
                  type="button"
                  onClick={() => { const next = Math.max(1, duration - 1); setDuration(next); setDurationRaw(String(next)); }}
                  className="flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-subtle transition-colors select-none"
                  style={{ width: 32, fontSize: 16, flexShrink: 0, height: "100%" }}
                >
                  −
                </button>
                <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
                  <input
                    type="number"
                    min={1}
                    value={durationRaw}
                    onChange={(e) => {
                      setDurationRaw(e.target.value);
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setDuration(v);
                    }}
                    onBlur={() => {
                      const clamped = Math.max(1, duration || 1);
                      setDuration(clamped);
                      setDurationRaw(String(clamped));
                    }}
                    className="tabular-nums font-semibold text-text-primary bg-transparent border-none outline-none text-center"
                    style={{ fontSize: 13, width: 40 }}
                  />
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    {locale === "zh" ? "分钟" : "min"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { const next = duration + 1; setDuration(next); setDurationRaw(String(next)); }}
                  className="flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-subtle transition-colors select-none"
                  style={{ width: 32, fontSize: 16, flexShrink: 0, height: "100%" }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Scheduled Start + Recurrence */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                  {t("edit.scheduledStart")}
                </div>
                {scheduledStart && (
                  <button
                    type="button"
                    onClick={() => setScheduledStart("")}
                    className="text-[10px] transition-colors"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("edit.clearSchedule")}
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="input"
                style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13 }}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                {t("task.recurrence")}
              </div>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                className="input"
                style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13 }}
              >
                {RECURRENCE_VALUES.map((r) => (
                  <option key={r} value={r}>
                    {t(`task.recurrence.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reminder */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                {t("edit.remindAt")}
              </div>
              {remindAt && (
                <button
                  type="button"
                  onClick={() => setRemindAt("")}
                  className="text-[10px] transition-colors"
                  style={{ color: "var(--text-faint)" }}
                >
                  {t("edit.clearReminder")}
                </button>
              )}
            </div>
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="input"
              style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13 }}
            />
          </div>

          {/* Tags */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
              {t("edit.tags")}
            </div>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder={t("edit.tags.placeholder")}
              inputAriaLabel={t("edit.tags")}
            />
          </div>

          {/* Assignees — multi-select */}
          {people.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                  {t("qc.assignee")}
                </div>
                {assigneeIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAssigneeIds([])}
                    className="text-[10px] transition-colors"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("qc.assignee.none")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {people.map((p) => {
                  const selected = assigneeIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleAssignee(p.id)}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] transition-colors"
                      style={{
                        border: selected ? "1px solid var(--accent-edge)" : "1px solid var(--border-default)",
                        background: selected ? "var(--accent-fog)" : "var(--bg-surface)",
                        color: selected ? "var(--accent-primary)" : "var(--text-secondary)",
                      }}
                    >
                      <PersonAvatar person={p} size={16} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-2 px-[18px] py-3 border-t border-border-faint">
          {/* Delete — left-anchored, confirm-to-delete pattern */}
          <button
            className="btn btn-ghost text-[12px] transition-colors"
            style={{ color: confirmDelete ? "var(--status-urgent)" : "var(--text-faint)", marginRight: "auto" }}
            onClick={handleDelete}
            disabled={busy}
          >
            {confirmDelete
              ? locale === "zh" ? "确认删除？" : "Confirm delete?"
              : t("edit.delete")}
          </button>
          {confirmDelete && (
            <button className="btn btn-ghost text-[12px]" onClick={() => setConfirmDelete(false)} disabled={busy}>
              {t("qc.cancel")}
            </button>
          )}
          {!confirmDelete && (
            <>
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t("qc.cancel")}</button>
              <button
                className="btn btn-primary"
                disabled={!title.trim() || busy}
                onClick={handleSave}
              >
                {t("edit.save")}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
