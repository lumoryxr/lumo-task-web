import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { clampProgress } from "@/lib/progress";
import { Spinner } from "@/components/Spinner";
import { TagInput } from "@/components/TagInput";
import { derivePlanTags } from "@/utils/planFilters";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { AssigneePicker } from "@/components/AssigneePicker";
import { FieldAction, FieldLabel } from "@/components/taskForm/FieldLabel";
import { QuadrantPicker } from "@/components/taskForm/QuadrantPicker";
import { DuePicker } from "@/components/taskForm/DuePicker";
import { DurationStepper } from "@/components/taskForm/DurationStepper";
import { RecurrencePicker } from "@/components/taskForm/RecurrencePicker";
import { DraftExitDialog } from "@/components/DraftExitDialog";
import { useTaskDraftsStore, type EditDraftFields } from "@/store/useTaskDraftsStore";
import { ProjectSelect } from "@/components/ProjectSelect";
import { toISODate } from "@/lib/format";
import type { Quadrant, Task, TaskRecurrence } from "@/types/task";

interface Props {
  task: Task;
  onClose: () => void;
}

export function TaskEditModal({ task, onClose }: Props) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const update = useTasksStore((s) => s.update);
  const remove = useTasksStore((s) => s.remove);
  const allTasks = useTasksStore((s) => s.tasks);
  const tagSuggestions = useMemo(() => derivePlanTags(allTasks), [allTasks]);
  const people = usePeopleStore((s) => s.people);
  const projects = useProjectsStore((s) => s.projects);

  const todayISO = toISODate(new Date());

  const initialTitle =
    typeof task.title === "string" ? task.title : (task.title as { en: string }).en;

  const initialDesc =
    task.desc ? (typeof task.desc === "string" ? task.desc : (task.desc as { en: string }).en) : "";

  // datetime-local requires "YYYY-MM-DDTHH:MM" — strip seconds if present
  const initialScheduledStart = task.scheduled_start
    ? task.scheduled_start.slice(0, 16)
    : "";

  // The form as the task stands now. A kept draft is tied to this snapshot.
  const base: EditDraftFields = {
    title: initialTitle,
    desc: initialDesc,
    quadrant: task.quadrant,
    duration: task.duration,
    dueDate: task.due === "today" ? todayISO : (task.due ?? ""),
    scheduledStart: initialScheduledStart,
    recurrence: task.recurrence ?? "none",
    assigneeIds: task.assignee_ids ?? [],
    tags: task.tags ?? [],
    projectId: task.project_id ?? null,
    progress: clampProgress(task.progress),
    sectionId: task.section_id ?? null,
    stageId: task.stage_id ?? null,
  };
  const baseKey = JSON.stringify(base);
  const saveEditDraft = useTaskDraftsStore((s) => s.saveEditDraft);
  const clearEditDraft = useTaskDraftsStore((s) => s.clearEditDraft);
  // Unsaved changes kept from last time come back — but only while the task is
  // still as it was then, so a stale draft never overwrites newer edits.
  const [restored, setRestored] = useState<EditDraftFields | null>(() => {
    const draft = useTaskDraftsStore.getState().editDrafts[task.id];
    return draft && draft.base === baseKey ? draft.fields : null;
  });
  const start = restored ?? base;

  const [title, setTitle] = useState(start.title);
  const [desc, setDesc] = useState(start.desc);
  const [quadrant, setQuadrant] = useState<Task["quadrant"]>(start.quadrant);
  const [duration, setDuration] = useState(start.duration);
  const [dueDate, setDueDate] = useState<string>(start.dueDate);
  const [scheduledStart, setScheduledStart] = useState<string>(start.scheduledStart);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(start.recurrence);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(start.assigneeIds);
  const [tags, setTags] = useState<string[]>(start.tags);
  const [projectId, setProjectId] = useState<string | null>(start.projectId);
  const [progress, setProgress] = useState<number>(start.progress);
  const [sectionId, setSectionId] = useState<string | null>(start.sectionId);
  // Groups belong to a project: offer the selected project's groups, and drop
  // the chosen group when the task moves to a project that doesn't have it.
  const projectSections = projects.find((p) => p.id === projectId)?.sections ?? [];
  const effectiveSectionId = projectSections.some((s) => s.id === sectionId) ? sectionId : null;
  const [stageId, setStageId] = useState<string | null>(start.stageId);
  const projectStages = projects.find((p) => p.id === projectId)?.stages ?? [];
  const effectiveStageId = projectStages.some((s) => s.id === stageId) ? stageId : null;
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const snapshot: EditDraftFields = {
    title, desc, quadrant, duration, dueDate, scheduledStart, recurrence,
    assigneeIds, tags, projectId, progress, sectionId, stageId,
  };
  const snapshotKey = JSON.stringify(snapshot);
  const dirty = snapshotKey !== baseKey;

  // A draft made against an older version of the task is dropped on open.
  const taskId = task.id;
  const staleOnOpen = useRef(
    (() => {
      const draft = useTaskDraftsStore.getState().editDrafts[taskId];
      return Boolean(draft && draft.base !== baseKey);
    })(),
  );
  useEffect(() => {
    if (staleOnOpen.current) {
      staleOnOpen.current = false;
      clearEditDraft(taskId);
    }
  }, [clearEditDraft, taskId]);

  // Keep unsaved changes as a draft while editing (not on mount, so opening
  // alone never touches a draft). Back to the task's values = nothing to keep.
  const lastSaved = useRef(snapshotKey);
  useEffect(() => {
    if (snapshotKey === lastSaved.current) return;
    lastSaved.current = snapshotKey;
    if (dirty) saveEditDraft(taskId, baseKey, JSON.parse(snapshotKey) as EditDraftFields);
    else clearEditDraft(taskId);
  }, [snapshotKey, dirty, baseKey, taskId, saveEditDraft, clearEditDraft]);

  /** The X / Cancel: close at once with nothing unsaved, else ask. */
  function requestClose() {
    if (dirty) setExitOpen(true);
    else onClose();
  }

  function forgetDraft() {
    lastSaved.current = baseKey;
    clearEditDraft(taskId);
  }

  function revertToTask() {
    setTitle(base.title);
    setDesc(base.desc);
    setQuadrant(base.quadrant);
    setDuration(base.duration);
    setDueDate(base.dueDate);
    setScheduledStart(base.scheduledStart);
    setRecurrence(base.recurrence);
    setAssigneeIds(base.assigneeIds);
    setTags(base.tags);
    setProjectId(base.projectId);
    setProgress(base.progress);
    setSectionId(base.sectionId);
    setStageId(base.stageId);
    forgetDraft();
    setRestored(null);
  }

  // Only the X closes this dialog: Escape is ignored (and the trap pauses
  // while the keep/discard question is open).
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, !exitOpen, { closeOnEscape: false });

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);
  const exitOpenRef = useRef(exitOpen);
  useEffect(() => { exitOpenRef.current = exitOpen; }, [exitOpen]);

  // Focus-trap / focus-return come from the shared hook; this keeps the
  // Cmd/Ctrl+Enter save shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !exitOpenRef.current) handleSaveRef.current();
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
        recurrence,
        assignee_ids: assigneeIds,
        tags,
        project_id: projectId,
        section_id: effectiveSectionId,
        stage_id: effectiveStageId,
        // Completion is adjusted from the task view, not here.
      });
      forgetDraft();
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
      forgetDraft();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    // No click-outside close: a stray click must not throw away unsaved edits.
    <div
      className="task-dialog-backdrop fade-in z-[200]"
      style={{ background: "rgba(8, 11, 10, 0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="task-dialog border rounded-[14px]"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--accent-edge)",
          boxShadow: "var(--shadow-lifted), 0 0 60px var(--accent-fog)",
        }}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-[18px] py-4 border-b border-border-faint">
          <div className="flex-1 text-[13px] font-semibold text-text-primary">{t("edit.title")}</div>
          <button
            onClick={requestClose}
            aria-label={t("qc.close")}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <IconClose size={12} />
          </button>
        </header>

        {restored && (
          <div
            role="status"
            className="flex items-center gap-2 px-[18px] py-2 text-[11.5px] border-b border-border-faint"
            style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
          >
            <span className="flex-1 min-w-0 truncate">{t("draft.restoredEdit")}</span>
            <button
              type="button"
              onClick={revertToTask}
              className="flex-shrink-0 rounded px-1.5 py-0.5 font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {t("draft.revert")}
            </button>
          </div>
        )}

        {/* Body — same order as the New task form, then Schedule and Organize */}
        <div className="task-dialog__body px-[18px] py-4 flex flex-col gap-4">
          {/* Name + description */}
          <div>
            <FieldLabel>{locale === "zh" ? "任务" : "Task"}</FieldLabel>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("qc.placeholder")}
              className="input"
              style={{ height: 40, fontSize: 14, fontWeight: 500 }}
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("edit.desc.placeholder")}
              aria-label={t("edit.desc")}
              rows={desc.split("\n").length > 2 ? 4 : 2}
              className="input resize-y mt-2"
              style={{ height: "auto", fontSize: 13, paddingTop: 8, paddingBottom: 8, lineHeight: "1.5" }}
            />
          </div>

          <QuadrantPicker value={quadrant as Quadrant} onChange={setQuadrant} />

          <DuePicker value={dueDate} onChange={setDueDate} />

          {/* Owner (主责任人) + collaborators */}
          {people.length > 0 && (
            <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} />
          )}

          {/* ── Schedule ── */}
          <FormGroupTitle>{t("edit.group.schedule")}</FormGroupTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DurationStepper value={duration} onChange={setDuration} />
            <div>
              <FieldLabel action={scheduledStart ? <FieldAction onClick={() => setScheduledStart("")}>{t("edit.clearSchedule")}</FieldAction> : undefined}>
                {t("edit.scheduledStart")}
              </FieldLabel>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                aria-label={t("edit.scheduledStart")}
                className="input"
                style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13, height: 34 }}
              />
            </div>
          </div>
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />

          {/* ── Organize ── */}
          <FormGroupTitle>{t("edit.group.organize")}</FormGroupTitle>
          {projects.length > 0 && (
            <div>
              <FieldLabel>{t("project.select.label")}</FieldLabel>
              <ProjectSelect
                label={t("project.select.label")}
                value={projectId}
                onChange={setProjectId}
                projects={projects}
              />
            </div>
          )}
          {(projectSections.length > 0 || projectStages.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Group inside the project — also the touch-friendly way to move a task */}
              {projectSections.length > 0 && (
                <div>
                  <FieldLabel>{t("edit.section")}</FieldLabel>
                  <select
                    value={effectiveSectionId ?? ""}
                    onChange={(e) => setSectionId(e.target.value || null)}
                    aria-label={t("edit.section")}
                    className="input"
                    style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13, height: 34 }}
                  >
                    <option value="">{t("edit.section.none")}</option>
                    {projectSections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Stage in the project's workflow */}
              {projectStages.length > 0 && (
                <div>
                  <FieldLabel>{t("edit.stage")}</FieldLabel>
                  <select
                    value={effectiveStageId ?? ""}
                    onChange={(e) => setStageId(e.target.value || null)}
                    aria-label={t("edit.stage")}
                    className="input"
                    style={{ colorScheme: "dark", cursor: "pointer", fontSize: 13, height: 34 }}
                  >
                    <option value="">{t("edit.stage.none")}</option>
                    {projectStages.map((s, i) => (
                      <option key={s.id} value={s.id}>{`${i + 1}. ${s.name}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div>
            <FieldLabel>{t("edit.tags")}</FieldLabel>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder={t("edit.tags.placeholder")}
              inputAriaLabel={t("edit.tags")}
              suggestions={tagSuggestions}
            />
          </div>
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
            {confirmDelete ? t("edit.deleteConfirm") : t("edit.delete")}
          </button>
          {confirmDelete && (
            <button className="btn btn-ghost text-[12px]" onClick={() => setConfirmDelete(false)} disabled={busy}>
              {t("qc.cancel")}
            </button>
          )}
          {!confirmDelete && (
            <>
              <button className="btn btn-ghost" onClick={requestClose} disabled={busy}>{t("qc.cancel")}</button>
              <button
                className="btn btn-primary"
                disabled={!title.trim() || busy}
                aria-busy={busy}
                aria-label={t("edit.save")}
                onClick={handleSave}
              >
                {busy ? <Spinner /> : t("edit.save")}
              </button>
            </>
          )}
        </footer>
      </div>
      <DraftExitDialog
        open={exitOpen}
        onKeep={() => {
          saveEditDraft(taskId, baseKey, snapshot);
          setExitOpen(false);
          onClose();
        }}
        onDiscard={() => {
          forgetDraft();
          setExitOpen(false);
          onClose();
        }}
        onContinue={() => setExitOpen(false)}
      />
    </div>,
    document.body
  );
}

/** A quiet divider-with-label that groups the less common fields. */
function FormGroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold text-text-muted">{children}</span>
      <span className="flex-1 h-px" style={{ background: "var(--border-faint)" }} />
    </div>
  );
}
