import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose, IconSparkle } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { TagInput } from "@/components/TagInput";
import { derivePlanTags } from "@/utils/planFilters";
import { toISODate } from "@/lib/format";
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
 * Modal for creating a task quickly. Per design: centered, dismiss via X or
 * Escape. Escape is a convenience but the X button is always the primary affordance.
 */
export function QuickCreate({ initialQuadrant = "Q2", initialTitle, initialDue, projectId, onClose, onCreated }: QuickCreateProps) {
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

  const [title, setTitle] = useState(initialTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [quadrant, setQuadrant] = useState<Quadrant>(initialQuadrant);
  const [duration, setDuration] = useState(30);
  const [durationRaw, setDurationRaw] = useState("30");
  const [dueDate, setDueDate] = useState<string>(initialDue ?? todayISO);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [tags, setTags] = useState<string[]>([]);
  // Owning project — prefilled from the `projectId` prop (e.g. when opened from
  // a project detail page) but user-selectable everywhere else (#211).
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId ?? null);
  const [aiMode, setAiMode] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiParsing, setAiParsing] = useState(false);
  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // Keep refs to the latest callbacks so the keydown listener is registered
  // only once but always calls the current version (avoids stale closures).
  const onCloseRef = useRef(onClose);
  const submitRef = useRef(submit);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { submitRef.current = submit; }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitRef.current();
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
      });
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
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
              {locale === "zh"
                ? "选个象限和时长，我会帮你排上。"
                : "Pick a quadrant + estimate. I'll slot it in."}
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
            onClick={onClose}
            aria-label={t("qc.close")}
            title={t("qc.close")}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <IconClose size={12} />
          </button>
        </header>

        {/* Body */}
        <div className="px-[18px] py-4 flex flex-col gap-4">
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
                    aria-pressed={active}
                    className="text-left rounded-lg border transition-colors"
                    style={{
                      padding: "9px 11px",
                      background: active ? "var(--bg-subtle)" : "var(--bg-surface)",
                      borderColor: active ? "var(--border-strong)" : "var(--border-default)",
                      boxShadow: active ? `0 0 0 1px var(--border-strong)` : "none",
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

          {/* Project — single owning project (#211) */}
          {projects.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint mb-1.5">
                {t("project.select.label")}
              </div>
              <select
                aria-label={t("project.select.label")}
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
                className="w-full text-sm rounded-md px-2.5 py-2 bg-transparent outline-none"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              >
                <option value="">{t("project.select.none")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.name}</option>
                ))}
              </select>
            </div>
          )}

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
        <footer className="flex items-center justify-end gap-2 px-[18px] py-3 border-t border-border-faint">
          <button className="btn btn-ghost" onClick={onClose}>{t("qc.cancel")}</button>
          <button className="btn btn-primary" style={{ minWidth: 76 }} disabled={!title.trim() || busy} aria-busy={busy} aria-label={t("qc.create")} onClick={submit}>
            {busy ? <Spinner /> : t("qc.create")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
