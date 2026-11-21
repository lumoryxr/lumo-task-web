import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronRight, IconClose, IconSparkle } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { AssigneePicker } from "@/components/AssigneePicker";
import { DraftExitDialog } from "@/components/DraftExitDialog";
import { useTaskDraftsStore, type CreateDraft } from "@/store/useTaskDraftsStore";
import { ProjectSelect } from "@/components/ProjectSelect";
import { TagInput } from "@/components/TagInput";
import { derivePlanTags } from "@/utils/planFilters";
import { fmtDuration, toISODate } from "@/lib/format";
import type { Quadrant, TaskRecurrence } from "@/types/task";

function getNextMonday(): string {
  const d = new Date();
  const daysUntil = ((8 - d.getDay()) % 7) || 7;
  return toISODate(new Date(d.getTime() + daysUntil * 86400000));
}

interface QuickCreateProps {
  initialQuadrant?: Quadrant;
  initialTitle?: string;
  initialDue?: string;
  /** When set, the created task is filed under this project. */
  projectId?: string;
  /** Group inside `projectId` to file the task into (only while that project stays selected). */
  sectionId?: string;
  onClose: () => void;
  onCreated?: () => void;
}

const QUADRANTS: Quadrant[] = ["Q1", "Q2", "Q3", "Q4"];

const Q_META: Record<Quadrant, { en: string; zh: string; descEn: string; descZh: string }> = {
  Q1:           { en: "Do first",  zh: "立即做", descEn: "Urgent & important",    descZh: "紧急 + 重要" },
  Q2:           { en: "Schedule",  zh: "安排做", descEn: "Important, not urgent", descZh: "重要，不紧急" },
  Q3:           { en: "Delegate",  zh: "委托做", descEn: "Urgent, not important", descZh: "紧急，不重要" },
  Q4:           { en: "Drop",      zh: "减少做", descEn: "Neither",               descZh: "都不是" },
  unclassified: { en: "Unsorted",  zh: "未分类", descEn: "Not yet placed",        descZh: "尚未归位" },
};

/**
 * Modal for creating a task quickly. It closes only from its X (or Cancel):
 * Escape and clicks outside are ignored, so typed input is never lost by
 * accident. What is typed is saved as a draft as you go; closing with input
 * asks whether to keep it, and a kept draft is restored the next time the
 * form opens (even after a reload).
 */
export function QuickCreate({ initialQuadrant = "Q2", initialTitle, initialDue, projectId, sectionId, onClose, onCreated }: QuickCreateProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const create = useTasksStore((s) => s.create);
  const parseTaskText = useTasksStore((s) => s.parseTaskText);
  const allTasks = useTasksStore((s) => s.tasks);
  const tagSuggestions = useMemo(() => derivePlanTags(allTasks), [allTasks]);
  const people = usePeopleStore((s) => s.people);
  const projects = useProjectsStore((s) => s.projects);

  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
  const nextWeekISO = getNextMonday();

  // What a fresh form holds in this context (where it was opened from).
  const defaults: CreateDraft = {
    title: initialTitle ?? "",
    quadrant: initialQuadrant,
    duration: 30,
    dueDate: initialDue ?? todayISO,
    assigneeIds: [],
    recurrence: "none",
    tags: [],
    projectId: projectId ?? null,
  };
  const saveCreateDraft = useTaskDraftsStore((s) => s.saveCreateDraft);
  const clearCreateDraft = useTaskDraftsStore((s) => s.clearCreateDraft);
  // An unfinished task from last time wins over the context defaults — unless
  // the form was opened with text of its own (e.g. typed in the command palette).
  const [restored, setRestored] = useState<CreateDraft | null>(() =>
    initialTitle ? null : useTaskDraftsStore.getState().createDraft,
  );
  const start = restored ?? defaults;

  const [title, setTitle] = useState(start.title);
  const [busy, setBusy] = useState(false);
  const [quadrant, setQuadrant] = useState<Quadrant>(start.quadrant);
  const [duration, setDuration] = useState(start.duration);
  const [durationRaw, setDurationRaw] = useState(String(start.duration));
  const [dueDate, setDueDate] = useState<string>(start.dueDate);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(start.assigneeIds);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(start.recurrence);
  const [tags, setTags] = useState<string[]>(start.tags);
  // Owning project — prefilled from the `projectId` prop (e.g. when opened from
  // a project detail page) but user-selectable everywhere else (#211).
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(start.projectId);
  const [exitOpen, setExitOpen] = useState(false);
  // "More options" starts folded, unless a restored draft set something there.
  const [moreOpen, setMoreOpen] = useState(
    () =>
      start.duration !== defaults.duration ||
      start.recurrence !== defaults.recurrence ||
      start.tags.length > 0 ||
      start.assigneeIds.length > 1 ||
      start.projectId !== defaults.projectId,
  );

  const snapshot: CreateDraft = {
    title, quadrant, duration, dueDate, assigneeIds, recurrence, tags, projectId: selectedProjectId,
  };
  const snapshotKey = JSON.stringify(snapshot);

  // What is set under "More options", shown on its toggle while folded.
  const moreSummary: string[] = [];
  if (assigneeIds.length > 1) {
    moreSummary.push(t("qc.more.collaborators").replace("{n}", String(assigneeIds.length - 1)));
  }
  const projectName = selectedProjectId ? projects.find((p) => p.id === selectedProjectId)?.name : undefined;
  if (projectName) moreSummary.push(projectName);
  if (duration !== defaults.duration) moreSummary.push(fmtDuration(duration, locale));
  if (recurrence !== "none") moreSummary.push(t(`task.recurrence.${recurrence}`));
  if (tags.length > 0) moreSummary.push(tags.map((tag) => `#${tag}`).join(" "));
  const dirty = snapshotKey !== JSON.stringify(defaults);

  // Save the draft as it changes (not on mount, so merely opening the form
  // never overwrites or clears a draft). Back at the defaults = nothing to keep.
  const lastSaved = useRef(snapshotKey);
  useEffect(() => {
    if (snapshotKey === lastSaved.current) return;
    lastSaved.current = snapshotKey;
    if (dirty) saveCreateDraft(JSON.parse(snapshotKey) as CreateDraft);
    else clearCreateDraft();
  }, [snapshotKey, dirty, saveCreateDraft, clearCreateDraft]);

  /** The X / Cancel: close at once if there is nothing to keep, else ask. */
  function requestClose() {
    if (dirty) setExitOpen(true);
    else onClose();
  }

  function resetToDefaults() {
    setTitle(defaults.title);
    setQuadrant(defaults.quadrant);
    setDuration(defaults.duration);
    setDurationRaw(String(defaults.duration));
    setDueDate(defaults.dueDate);
    setAssigneeIds(defaults.assigneeIds);
    setRecurrence(defaults.recurrence);
    setTags(defaults.tags);
    setSelectedProjectId(defaults.projectId);
    clearCreateDraft();
    setRestored(null);
  }
  const [aiMode, setAiMode] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);

  // Keep refs to the latest callbacks so the keydown listener is registered
  // only once but always calls the current version (avoids stale closures).
  // Escape deliberately does nothing here: only the X closes the form.
  const submitRef = useRef(submit);
  const exitOpenRef = useRef(exitOpen);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  useEffect(() => { exitOpenRef.current = exitOpen; }, [exitOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !exitOpenRef.current) submitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleAiParse() {
    if (!aiText.trim() || aiParsing) return;
    setAiParsing(true);
    try {
      const result = await parseTaskText(aiText.trim(), locale);
      setTitle(result.title);
      if (result.quadrant && result.quadrant !== "unclassified") {
        setQuadrant(result.quadrant as Quadrant);
      }
      if (result.due) {
        setDueDate(result.due);
      }
      if (result.duration) {
        setDuration(result.duration);
        setDurationRaw(String(result.duration));
      }
      setAiMode(false);
    } catch {
      // Silently fall back — don't block the user
    } finally {
      setAiParsing(false);
    }
  }

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await create({
        title: { en: title.trim(), zh: title.trim() },
        quadrant,
        today: dueDate === todayISO,
        due: dueDate || null,
        duration,
        pomos_total: Math.max(1, Math.ceil(duration / 25)),
        assignee_ids: assigneeIds,
        recurrence,
        tags,
        ...(selectedProjectId ? { project_id: selectedProjectId } : {}),
        // The group belongs to the project the dialog was opened from.
        ...(sectionId && selectedProjectId === projectId ? { section_id: sectionId } : {}),
      });
      // Created: the draft has done its job.
      lastSaved.current = JSON.stringify(defaults);
      clearCreateDraft();
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    // No click-outside close: a stray click must not throw away what was typed.
    <div
      className="fade-in fixed inset-0 z-[150] flex items-center justify-center"
      style={{ background: "rgba(8, 11, 10, 0.6)", backdropFilter: "blur(6px)", padding: "0 32px" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-hidden border rounded-[14px] bg-elevated shadow-lifted"
        style={{
          maxWidth: 520,
          borderColor: "var(--accent-edge)",
          boxShadow: "var(--shadow-lifted), 0 0 60px var(--accent-fog)",
          marginTop: "-6vh",
        }}
      >
        {/* Header */}
        <header className="flex items-start gap-3 px-[18px] py-4 border-b border-border-faint">
          <span className="lumo-glyph" style={{ width: 14, height: 14, marginTop: 3 }}>
            <span className="halo" />
            <span className="core" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-text-primary">{t("qc.title")}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              {t("qc.subtitle")}
            </div>
          </div>
          <button
            onClick={() => setAiMode((v) => !v)}
            title={t("qc.ai")}
            className="flex-shrink-0 flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-semibold transition-colors"
            style={{
              background: aiMode ? "var(--accent-fog)" : "transparent",
              border: `1px solid ${aiMode ? "var(--accent-edge)" : "var(--border-default)"}`,
              color: aiMode ? "var(--accent-primary)" : "var(--text-muted)",
            }}
          >
            <IconSparkle size={10} />
            {t("qc.ai")}
          </button>
          <button
            onClick={requestClose}
            aria-label={t("qc.close")}
            title={t("qc.close")}
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
            <span className="flex-1 min-w-0 truncate">{t("draft.restored")}</span>
            <button
              type="button"
              onClick={resetToDefaults}
              className="flex-shrink-0 rounded px-1.5 py-0.5 font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {t("draft.clear")}
            </button>
          </div>
        )}

        {/* Body — scrolls inside the dialog when More options makes it tall */}
        <div className="px-[18px] py-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 190px)" }}>
          {/* AI Parse input */}
          {aiMode && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--accent-primary)" }}>
                {t("qc.ai")}
              </div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAiParse(); }}
                  placeholder={t("qc.ai.placeholder")}
                  className="input flex-1"
                  style={{ height: 40, fontSize: 13 }}
                />
                <button
                  onClick={handleAiParse}
                  disabled={!aiText.trim() || aiParsing}
                  className="flex-shrink-0 px-3 rounded-md text-[12px] font-semibold text-text-inverse disabled:opacity-50 transition-opacity"
                  style={{ background: "var(--accent-primary)" }}
                >
                  {aiParsing ? t("qc.ai.parsing") : t("qc.ai.parse")}
                </button>
              </div>
              <div className="mt-1 text-[10px] text-text-faint">{t("qc.ai.hint")}</div>
            </div>
          )}

          {/* Title */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
              {locale === "zh" ? "任务" : "Task"}
            </div>
            <input
              autoFocus={!aiMode}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("qc.placeholder")}
              className="input"
              style={{ height: 40, fontSize: 14, fontWeight: 500 }}
            />
          </div>

          {/* Quadrant — one compact row; the description is in the tooltip */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
              {t("qc.quadrant")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {QUADRANTS.map((q) => {
                const meta = Q_META[q];
                const active = quadrant === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuadrant(q)}
                    aria-pressed={active}
                    title={locale === "zh" ? meta.descZh : meta.descEn}
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 h-9 transition-colors"
                    style={{
                      background: active ? "var(--bg-subtle)" : "var(--bg-surface)",
                      borderColor: active ? "var(--border-strong)" : "var(--border-default)",
                      boxShadow: active ? "0 0 0 1px var(--border-strong)" : "none",
                    }}
                  >
                    <span className={`qdot qdot-${q.toLowerCase()}`} />
                    <span className="text-[11px] font-semibold text-text-primary">{q}</span>
                    <span
                      className="text-[11px] font-medium truncate"
                      style={{ color: `var(--q${q[1]}-color, var(--text-muted))` }}
                    >
                      {locale === "zh" ? meta.zh : meta.en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due — quick picks and a date field on one line */}
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
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { label: t("due.today"), value: todayISO },
                { label: t("due.tomorrow"), value: tomorrowISO },
                { label: t("due.nextWeek"), value: nextWeekISO },
              ]).map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDueDate(value)}
                  aria-pressed={dueDate === value}
                  className="text-[11px] px-2 h-8 rounded-md transition-colors"
                  style={{
                    background: dueDate === value ? "var(--accent-fog)" : "var(--bg-surface)",
                    border: `1px solid ${dueDate === value ? "var(--accent-edge)" : "var(--border-default)"}`,
                    color: dueDate === value ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                >
                  {label}
                </button>
              ))}
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label={t("qc.due")}
                className="input flex-1 min-w-[140px]"
                style={{ colorScheme: "dark", cursor: "pointer", height: 32 }}
              />
            </div>
          </div>

          {/* Owner (主责任人) — one person; collaborators live under More options */}
          {people.length > 0 && (
            <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} part="primary" />
          )}

          {/* More options: everything most tasks don't need. The toggle lists
              whatever is set inside, so nothing hides unnoticed. */}
          <div className="-mx-1">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-controls="qc-more"
              className="w-full flex items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <span
                aria-hidden="true"
                className="flex-shrink-0 text-text-faint transition-transform"
                style={{ transform: moreOpen ? "rotate(90deg)" : "none" }}
              >
                <IconChevronRight size={12} strokeWidth={2} />
              </span>
              <span className="flex-shrink-0">{t("qc.more")}</span>
              {!moreOpen && moreSummary.length > 0 && (
                <span className="flex-1 min-w-0 truncate text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>
                  · {moreSummary.join(" · ")}
                </span>
              )}
            </button>
          </div>

          {moreOpen && (
            <div id="qc-more" className="flex flex-col gap-4 -mt-1">
              {people.length > 0 && (
                <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} part="collaborators" />
              )}

              {/* Project — single owning project (#211) */}
              {projects.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                    {t("project.select.label")}
                  </div>
                  <ProjectSelect
                    label={t("project.select.label")}
                    value={selectedProjectId}
                    onChange={setSelectedProjectId}
                    projects={projects}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                {t("qc.duration")}
              </div>
              <div
                className="flex items-center rounded-md border overflow-hidden"
                style={{
                  height: 36,
                  borderColor: "var(--border-default)",
                  background: "var(--bg-surface)",
                }}
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

              {/* Recurrence */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                  {t("task.recurrence")}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {(["none", "daily", "weekdays", "weekly", "monthly"] as TaskRecurrence[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecurrence(r)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                      style={{
                        background: recurrence === r ? "var(--accent-fog)" : "var(--bg-surface)",
                        border: `1px solid ${recurrence === r ? "var(--accent-edge)" : "var(--border-default)"}`,
                        color: recurrence === r ? "var(--accent-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {t(`task.recurrence.${r}`)}
                    </button>
                  ))}
                </div>
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
                  suggestions={tagSuggestions}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 px-[18px] py-3 border-t border-border-faint">
          <button className="btn btn-ghost" onClick={requestClose}>{t("qc.cancel")}</button>
          <button className="btn btn-primary" style={{ minWidth: 76 }} disabled={!title.trim() || busy} aria-busy={busy} aria-label={t("qc.create")} onClick={submit}>
            {busy ? <Spinner /> : t("qc.create")}
          </button>
        </footer>
      </div>
      <DraftExitDialog
        open={exitOpen}
        onKeep={() => {
          saveCreateDraft(snapshot);
          setExitOpen(false);
          onClose();
        }}
        onDiscard={() => {
          lastSaved.current = JSON.stringify(defaults);
          clearCreateDraft();
          setExitOpen(false);
          onClose();
        }}
        onContinue={() => setExitOpen(false)}
      />
    </div>,
    document.body,
  );
}
