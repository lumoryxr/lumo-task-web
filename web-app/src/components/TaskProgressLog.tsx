import { useId, useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { toast } from "@/store/useToastStore";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconEdit, IconTrash } from "@/components/icons";
import { toISODate } from "@/lib/format";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { MAX_PROGRESS_NOTE_LENGTH } from "@lumo/contracts";
import type { Locale, Task, TaskProgressNote } from "@/types/task";

interface TaskProgressLogProps {
  task: Task;
  /** Put the cursor in the composer on mount (when opened as its own panel). */
  autoFocus?: boolean;
}

function dayLabel(date: string, locale: Locale, t: (k: string) => string): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const [y, m, d] = date.split("-").map(Number);
  const asDate = new Date(y, m - 1, d);
  const formatted = asDate.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short", day: "numeric", weekday: "short",
    ...(y !== today.getFullYear() ? { year: "numeric" as const } : {}),
  });
  if (date === toISODate(today)) return `${t("progressLog.today")} · ${formatted}`;
  if (date === toISODate(yesterday)) return `${t("progressLog.yesterday")} · ${formatted}`;
  return formatted;
}

function clock(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * A task's progress log (进展记录): short dated updates, newest day first.
 * A composer at the top records today's progress (or an earlier day's); each
 * update can be edited in place or deleted. Rendered as the body of the
 * progress drawer, which scrolls, so every update is listed.
 */
export function TaskProgressLog({ task, autoFocus = false }: TaskProgressLogProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const addProgressNote = useTasksStore((s) => s.addProgressNote);
  const editProgressNote = useTasksStore((s) => s.editProgressNote);
  const deleteProgressNote = useTasksStore((s) => s.deleteProgressNote);
  const todayISO = toISODate(new Date());
  const composerId = useId();
  // Touch screens have no hover: keep each update's edit/delete visible there.
  const coarse = useCoarsePointer();

  const [text, setText] = useState("");
  const [date, setDate] = useState(todayISO);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; date: string; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskProgressNote | null>(null);

  // Newest day first; within a day, the latest written first.
  const notes = [...(task.progress_log ?? [])].sort((a, b) =>
    a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date),
  );
  const days: Array<{ date: string; items: TaskProgressNote[] }> = [];
  for (const n of notes) {
    const last = days[days.length - 1];
    if (last && last.date === n.date) last.items.push(n);
    else days.push({ date: n.date, items: [n] });
  }

  async function add() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addProgressNote(task.id, { date, text });
      setText("");
      setDate(todayISO);
    } catch {
      toast.error(t("progressLog.error"));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editing.text.trim() || busy) return;
    setBusy(true);
    try {
      await editProgressNote(task.id, editing.id, { date: editing.date, text: editing.text });
      setEditing(null);
    } catch {
      toast.error(t("progressLog.error"));
    } finally {
      setBusy(false);
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void add();
    } else if (e.key === "Escape" && text.trim()) {
      // Don't let Escape close the task while an update is being written.
      e.stopPropagation();
    }
  }

  return (
    <div>
      {/* Composer */}
      <div className="progress-composer rounded-lg border" style={{ background: "var(--bg-surface)" }}>
        <textarea
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onComposerKey}
          rows={text.split("\n").length > 2 ? 4 : 2}
          maxLength={MAX_PROGRESS_NOTE_LENGTH}
          placeholder={t("progressLog.placeholder")}
          aria-label={t("progressLog.composerLabel")}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed text-text-primary outline-none placeholder:text-text-faint"
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <input
            type="date"
            value={date}
            max={todayISO}
            onChange={(e) => setDate(e.target.value || todayISO)}
            aria-label={t("progressLog.dateLabel")}
            title={t("progressLog.dateLabel")}
            className="rounded-md border bg-transparent px-1.5 h-7 text-[11.5px] text-text-secondary"
            style={{ borderColor: "var(--border-default)", colorScheme: "dark" }}
          />
          <span className="flex-1 text-[10.5px] truncate" style={{ color: "var(--text-faint)" }}>
            {t("progressLog.shortcut")}
          </span>
          <button
            type="button"
            onClick={() => void add()}
            disabled={!text.trim() || busy}
            aria-busy={busy}
            aria-label={t("progressLog.add")}
            className="btn btn-primary disabled:opacity-50"
            style={{ height: 28, fontSize: 12, padding: "0 12px" }}
          >
            {t("progressLog.add")}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {notes.length === 0 ? (
        <p className="mt-2.5 text-[12px]" style={{ color: "var(--text-faint)" }}>{t("progressLog.empty")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {days.map((group) => {
            const headingId = `${composerId}-${group.date}`;
            return (
              <div key={group.date}>
                <h4 id={headingId} className="m-0 mb-1.5 text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  {dayLabel(group.date, locale, t)}
                </h4>
                <ul aria-labelledby={headingId} className="m-0 ml-1.5 p-0 list-none flex flex-col gap-1.5 border-l pl-3" style={{ borderColor: "var(--accent-edge)" }}>
                  {group.items.map((n) => (
                    <li key={n.id} className="group relative">
                      <span
                        aria-hidden="true"
                        className="absolute -left-[15.5px] top-[7px] w-[6px] h-[6px] rounded-full"
                        style={{ background: "var(--accent-primary)" }}
                      />
                      {editing?.id === n.id ? (
                        <div className="flex flex-col gap-1.5">
                          <textarea
                            autoFocus
                            value={editing.text}
                            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(); }
                              else if (e.key === "Escape") { e.stopPropagation(); setEditing(null); }
                            }}
                            rows={3}
                            maxLength={MAX_PROGRESS_NOTE_LENGTH}
                            aria-label={t("progressLog.edit")}
                            className="input w-full resize-y text-[13px] leading-relaxed"
                            style={{ height: "auto", padding: "6px 8px" }}
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={editing.date}
                              max={todayISO}
                              onChange={(e) => setEditing({ ...editing, date: e.target.value || editing.date })}
                              aria-label={t("progressLog.dateLabel")}
                              className="rounded-md border bg-transparent px-1.5 h-7 text-[11.5px] text-text-secondary"
                              style={{ borderColor: "var(--border-default)", colorScheme: "dark" }}
                            />
                            <div className="flex-1" />
                            <button type="button" className="btn btn-ghost" style={{ height: 28, fontSize: 12 }} onClick={() => setEditing(null)}>
                              {t("progressLog.cancel")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary disabled:opacity-50"
                              style={{ height: 28, fontSize: 12, padding: "0 12px" }}
                              disabled={!editing.text.trim() || busy}
                              onClick={() => void saveEdit()}
                            >
                              {t("progressLog.save")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <p className="m-0 flex-1 min-w-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
                            {n.text}
                          </p>
                          <span className="flex-shrink-0 pt-[3px] text-[10.5px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                            {clock(n.created_at, locale)}
                            {n.edited_at && <> · <span>{t("progressLog.edited")}</span></>}
                          </span>
                          <span className={`flex-shrink-0 flex items-center gap-0.5 transition-opacity ${coarse ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                            <button
                              type="button"
                              aria-label={t("progressLog.edit")}
                              title={t("progressLog.edit")}
                              onClick={() => setEditing({ id: n.id, date: n.date, text: n.text })}
                              className="flex items-center justify-center w-6 h-6 rounded text-text-faint hover:text-text-primary hover:bg-subtle"
                            >
                              <IconEdit size={12} />
                            </button>
                            <button
                              type="button"
                              aria-label={t("progressLog.delete")}
                              title={t("progressLog.delete")}
                              onClick={() => setPendingDelete(n)}
                              className="flex items-center justify-center w-6 h-6 rounded text-text-faint hover:text-text-primary hover:bg-subtle"
                            >
                              <IconTrash size={12} />
                            </button>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("progressLog.deleteTitle")}
        message={t("progressLog.deleteMessage")}
        confirmLabel={t("progressLog.deleteConfirm")}
        danger
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) {
            deleteProgressNote(task.id, target.id).catch(() => toast.error(t("progressLog.error")));
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
