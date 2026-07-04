import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Project, ProjectColor, ProjectGoal, GoalConfidence } from "@/types/task";
import { TaskRow } from "@/components/TaskRow";
import { ProjectBoard } from "@/components/ProjectBoard";
import { ProjectContentEditor } from "@/components/ProjectContentEditor";
import { ProjectRecapCard } from "@/components/ProjectRecapCard";
import { ProgressRing } from "@/components/ProgressRing";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { AddExistingTaskModal } from "@/components/AddExistingTaskModal";
import { EmptyState } from "@/components/EmptyState";
import { computeProjectRecap } from "@/utils/projectRecap";
import { isKpiGoal, goalPct, parseTarget, nextConfidence } from "@/utils/goalKpi";
import { IconArrowLeft, IconBookmark, IconCheck, IconClose, IconPlus, IconProject, IconShare, IconTrash } from "@/components/icons";

const COLORS: ProjectColor[] = ["green", "cyan", "amber", "red"];
// OKR check-in status → token color (green on track, amber at risk, red off track).
const CONFIDENCE_COLOR: Record<GoalConfidence, string> = {
  on_track: "var(--accent-primary)",
  at_risk: "var(--status-warning)",
  off_track: "var(--status-urgent)",
};
const COLOR_PRIMARY: Record<ProjectColor, string> = {
  green: "var(--accent-primary)",
  cyan: "var(--status-info)",
  amber: "var(--status-warning)",
  red: "var(--status-urgent)",
};

export function ProjectDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === id));
  const update = useProjectsStore((s) => s.update);
  const remove = useProjectsStore((s) => s.remove);
  const tasks = useTasksStore((s) => s.tasks);
  const createTask = useTasksStore((s) => s.create);
  const saveFromProject = useTemplatesStore((s) => s.saveFromProject);
  const doneCount = useProjectsStore((s) => (id ? s.doneCounts[id] ?? 0 : 0));
  const focusMinutes = useProjectsStore((s) => (id ? s.focusMinutes[id] ?? 0 : 0));
  const loadProgress = useProjectsStore((s) => s.loadProgress);
  const userName = useAuthStore((s) => s.user.name);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "archive" | "delete">(null);
  const [pendingGoalRemove, setPendingGoalRemove] = useState<number | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const [notesEditing, setNotesEditing] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  const [newGoal, setNewGoal] = useState("");
  const [newGoalStart, setNewGoalStart] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalUnit, setNewGoalUnit] = useState("");
  const [newTask, setNewTask] = useState("");

  // Header fields are controlled drafts with an explicit ✓ confirm button, so
  // an edit is only persisted on confirm/Enter (not per keystroke). Re-seed
  // when switching projects or when the saved value changes (e.g. after commit).
  const [nameDraft, setNameDraft] = useState("");
  const [catDraft, setCatDraft] = useState("");
  useEffect(() => {
    setNameDraft(project?.name ?? "");
    setCatDraft(project?.category ?? "");
  }, [project?.id, project?.name, project?.category]);

  // Real done/total for the Tasks section (#223).
  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  if (!project) {
    return (
      <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
        <BackLink onClick={() => navigate("/projects")} label={t("project.page.title")} />
        <EmptyState icon={<IconProject size={28} />} title={t("project.empty.title")} />
      </div>
    );
  }

  const pid = project.id;
  const projectTasks = tasks.filter((tk) => tk.project_id === pid && !tk.completed);
  const goals = project.goals;

  // Commit header edits only on confirm/Enter, and only when actually changed —
  // an empty name falls back to "Untitled" at commit time (not while typing).
  const nameDirty = nameDraft !== project.name;
  const catDirty = catDraft !== (project.category ?? "");
  function commitName() {
    const name = nameDraft.trim() || t("project.untitled");
    if (name !== project!.name) update(pid, { name });
    setNameDraft(name);
  }
  function commitCategory() {
    const category = catDraft.trim() || undefined;
    if ((category ?? "") !== (project!.category ?? "")) update(pid, { category });
    setCatDraft(category ?? "");
  }
  function commitEmoji(v: string) {
    const emoji = v.trim() || undefined;
    if ((emoji ?? "") !== (project!.emoji ?? "")) update(pid, { emoji });
  }

  function setGoals(next: ProjectGoal[]) {
    update(pid, { goals: next });
  }
  function addGoal() {
    const text = newGoal.trim();
    if (!text) return;
    const target = parseTarget(newGoalTarget);
    // `start` only applies to a KPI goal; a positive baseline means progress is
    // measured start→target and current seeds at the baseline (0% to begin).
    const startNum = Number(newGoalStart.trim());
    const start = Number.isFinite(startNum) && startNum > 0 ? startNum : undefined;
    const goal: ProjectGoal = target
      ? { text, done: false, target, start, current: start ?? 0, unit: newGoalUnit.trim() || undefined }
      : { text, done: false };
    setGoals([...goals, goal]);
    setNewGoal("");
    setNewGoalStart("");
    setNewGoalTarget("");
    setNewGoalUnit("");
  }
  function toggleGoal(i: number) {
    setGoals(goals.map((g, idx) => (idx === i ? { ...g, done: !g.done } : g)));
  }
  function setGoalCurrent(i: number, current: number) {
    setGoals(goals.map((g, idx) => (idx === i ? { ...g, current: Math.max(0, current) } : g)));
  }
  function cycleGoalConfidence(i: number) {
    setGoals(goals.map((g, idx) => (idx === i ? { ...g, confidence: nextConfidence(g.confidence) } : g)));
  }
  function removeGoal(i: number) {
    setGoals(goals.filter((_, idx) => idx !== i));
  }

  async function addTask() {
    const text = newTask.trim();
    if (!text || addingTask) return;
    setNewTask("");
    setAddingTask(true);
    try { await createTask({ title: { en: text }, project_id: pid }); }
    finally { setAddingTask(false); }
  }

  function onEnter(e: KeyboardEvent, fn: () => void) {
    if (e.key === "Enter") { e.preventDefault(); fn(); }
  }

  async function handleSaveTemplate(p: Project) {
    if (savingTemplate) return;
    setSavingTemplate(true);
    try {
      await saveFromProject(p, projectTasks);
    } finally {
      setSavingTemplate(false);
    }
  }

  const primary = COLOR_PRIMARY[project.color];
  const totalTasks = doneCount + projectTasks.length;
  const pct = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const goalsDone = goals.filter((g) => g.done).length;
  const focusHours = focusMinutes > 0 ? (focusMinutes / 60).toFixed(1) : "0";

  return (
    <div className="fade-in w-full px-4 sm:px-7 py-6 sm:py-7">
      <BackLink onClick={() => navigate("/projects")} label={t("project.page.title")} />

      {/* Header — controlled drafts with an explicit ✓ confirm button per field.
          The confirm only appears when the value actually changed; Enter also
          commits, Escape reverts. An empty name falls back to "Untitled" only at
          commit time, never mid-type (keeps the #247 rename-bug fix). */}
      <div className="flex items-start gap-3 mt-3 mb-6">
        <input
          key={`${pid}-emoji`}
          aria-label={t("project.field.emoji")}
          defaultValue={project.emoji ?? ""}
          onBlur={(e) => commitEmoji(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          placeholder="📁"
          className="flex-shrink-0 text-center text-xl rounded-lg"
          style={{ width: 44, height: 44, background: primary, color: "var(--text-inverse)", border: "none" }}
          maxLength={4}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <input
              aria-label={t("project.field.name")}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                else if (e.key === "Escape") setNameDraft(project.name);
              }}
              placeholder={t("project.field.namePlaceholder")}
              className="inline-input flex-1 min-w-0 text-lg font-semibold"
            />
            {nameDirty && <ConfirmEditBtn label={t("project.save")} onClick={commitName} />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <input
              aria-label={t("project.category.label")}
              value={catDraft}
              onChange={(e) => setCatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCategory();
                else if (e.key === "Escape") setCatDraft(project.category ?? "");
              }}
              placeholder={t("project.category.placeholder")}
              className="inline-input flex-1 min-w-0 text-xs text-text-muted"
            />
            {catDirty && <ConfirmEditBtn label={t("project.save")} onClick={commitCategory} />}
          </div>
        </div>
      </div>

      {/* Color + actions */}
      <div className="flex items-center gap-2 mb-6">
        {COLORS.map((c) => (
          <button
            key={c}
            aria-label={c}
            aria-pressed={project.color === c}
            onClick={() => update(project.id, { color: c })}
            className="rounded-full transition-transform"
            style={{
              width: 20, height: 20, background: COLOR_PRIMARY[c],
              outline: project.color === c ? "2px solid var(--text-primary)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setRecapOpen(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
        >
          <IconShare size={12} />
          {t("project.recap.button")}
        </button>
        <button
          onClick={() => void handleSaveTemplate(project)}
          disabled={savingTemplate}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
        >
          <IconBookmark size={12} />
          {t("project.saveAsTemplate")}
        </button>
        <button
          onClick={() => {
            // Archiving is disruptive (hides the project) → confirm. Unarchiving
            // is harmless, so it needs none.
            if (project.status === "archived") {
              update(project.id, { status: "active" });
            } else {
              setConfirmKind("archive");
            }
          }}
          className="text-xs px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
        >
          {project.status === "archived" ? t("project.unarchive") : t("project.archive")}
        </button>
        <button
          onClick={() => setConfirmKind("delete")}
          aria-label={t("project.delete")}
          title={t("project.delete")}
          className="flex items-center justify-center w-[28px] h-[26px] rounded-md transition-colors"
          style={{ color: "var(--status-urgent)", border: "1px solid var(--border-default)" }}
        >
          <IconTrash size={13} />
        </button>
      </div>

      {/* Overview band — the whole picture at a glance (#246 PR2):
          progress ring + tasks done/total + goals + focus hours + status. */}
      <div
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-4 py-3 mb-6"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-2.5">
          <ProgressRing pct={pct} color={primary} size={44} stroke={4} />
          <div className="leading-tight">
            <div className="text-lg font-semibold tabular-nums text-text-primary">{pct}%</div>
            <div className="text-[11px] text-text-muted">{t("project.progress.label")}</div>
          </div>
        </div>
        <OverviewStat label={t("project.tasks.title")} value={`${doneCount}/${totalTasks}`} />
        <OverviewStat label={t("project.recap.goals")} value={`${goalsDone}/${goals.length}`} icon="🎯" />
        <OverviewStat label={t("project.overview.focus")} value={`${focusHours}h`} />
        <OverviewStat
          label={t("project.overview.status")}
          value={project.status === "archived" ? t("project.status.archived") : t("project.status.active")}
        />
      </div>

      {/* Notes — editable rich text with a display/edit state, hoisted to the
          top so the project's write-up is the first thing you see (#215). */}
      <Section
        title={t("project.content.title")}
        extra={
          <button
            onClick={() => setNotesEditing((v) => !v)}
            aria-pressed={notesEditing}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md normal-case tracking-normal transition-colors"
            style={{ border: "1px solid var(--border-default)", color: notesEditing ? "var(--accent-primary)" : "var(--text-muted)" }}
          >
            {notesEditing ? (<><IconCheck size={12} />{t("project.content.done")}</>) : t("project.content.edit")}
          </button>
        }
      >
        {notesEditing ? (
          <ProjectContentEditor
            value={project.content}
            onChange={(json) => update(pid, { content: json || undefined })}
          />
        ) : project.content ? (
          <ProjectContentEditor value={project.content} editable={false} onChange={() => {}} />
        ) : (
          <p className="text-xs text-text-faint">{t("project.content.empty")}</p>
        )}
      </Section>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8 lg:items-start">
        <div>
      {/* Key goals */}
      <Section title={t("project.goals.title")}>
        {goals.length === 0 && <p className="text-xs text-text-faint mb-2">{t("project.goals.empty")}</p>}
        <div className="flex flex-col gap-1.5 mb-2">
          {goals.map((g, i) => (
            <GoalItem
              key={i}
              goal={g}
              deleteLabel={t("common.delete")}
              onToggle={() => toggleGoal(i)}
              onRemove={() => setPendingGoalRemove(i)}
              onSetCurrent={(v) => setGoalCurrent(i, v)}
              onCycleConfidence={() => cycleGoalConfidence(i)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => onEnter(e, addGoal)}
            placeholder={t("project.goals.placeholder")}
            className="inline-input flex-1 min-w-[140px] text-sm"
          />
          <input
            type="number"
            min={0}
            value={newGoalStart}
            onChange={(e) => setNewGoalStart(e.target.value)}
            onKeyDown={(e) => onEnter(e, addGoal)}
            placeholder={t("project.goals.start")}
            aria-label={t("project.goals.start")}
            className="inline-input w-20 text-sm"
          />
          <input
            type="number"
            min={0}
            value={newGoalTarget}
            onChange={(e) => setNewGoalTarget(e.target.value)}
            onKeyDown={(e) => onEnter(e, addGoal)}
            placeholder={t("project.goals.target")}
            aria-label={t("project.goals.target")}
            className="inline-input w-20 text-sm"
          />
          <input
            value={newGoalUnit}
            onChange={(e) => setNewGoalUnit(e.target.value)}
            onKeyDown={(e) => onEnter(e, addGoal)}
            placeholder={t("project.goals.unit")}
            aria-label={t("project.goals.unit")}
            maxLength={12}
            className="inline-input w-16 text-sm"
          />
          <button onClick={addGoal} aria-label={t("project.goals.add")} className="text-text-secondary hover:text-text-primary transition-colors">
            <IconPlus size={16} />
          </button>
        </div>
      </Section>
        </div>

        <div>
      {/* Tasks */}
      <Section
        title={t("project.tasks.title")}
        extra={
          <div className="flex items-center gap-2 normal-case tracking-normal">
            <div className="flex items-center rounded-md overflow-hidden" style={{ border: "1px solid var(--border-default)" }}>
              {(["list", "board"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTaskView(v)}
                  aria-pressed={taskView === v}
                  className="text-[11px] font-medium px-2 py-0.5 transition-colors"
                  style={{
                    background: taskView === v ? "var(--bg-elevated)" : "transparent",
                    color: taskView === v ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {t(`project.view.${v}`)}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {projectTasks.length === 0 && <p className="text-xs text-text-faint mb-2">{t("project.tasks.empty")}</p>}
        {projectTasks.length > 0 && taskView === "board" ? (
          <ProjectBoard tasks={projectTasks} />
        ) : (
          <div>
            {projectTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => onEnter(e, addTask)}
            placeholder={t("project.tasks.add")}
            className="inline-input flex-1 text-sm"
          />
          <button onClick={addTask} disabled={addingTask} aria-busy={addingTask} aria-label={t("project.tasks.add")} className="text-text-secondary hover:text-text-primary transition-colors disabled:opacity-60">
            {addingTask ? <Spinner size={16} /> : <IconPlus size={16} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAddExistingOpen(true)}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          <IconPlus size={12} />
          {t("project.tasks.addExisting")}
        </button>
      </Section>
        </div>
      </div>

      {recapOpen && (
        <ProjectRecapCard
          project={project}
          recap={computeProjectRecap(project, doneCount, projectTasks.length, focusMinutes)}
          userName={userName}
          onClose={() => setRecapOpen(false)}
        />
      )}

      {addExistingOpen && (
        <AddExistingTaskModal projectId={pid} onClose={() => setAddExistingOpen(false)} />
      )}

      <ConfirmDialog
        open={confirmKind === "archive"}
        title={t("project.archiveConfirm.title")}
        message={t("project.archiveConfirm")}
        confirmLabel={t("project.archive")}
        onConfirm={() => { update(project.id, { status: "archived" }); setConfirmKind(null); }}
        onCancel={() => setConfirmKind(null)}
      />
      <ConfirmDialog
        open={confirmKind === "delete"}
        danger
        title={t("project.deleteConfirm.title")}
        message={t("project.deleteConfirm")}
        confirmLabel={t("project.delete")}
        onConfirm={() => { setConfirmKind(null); remove(project.id); navigate("/projects"); }}
        onCancel={() => setConfirmKind(null)}
      />
      <ConfirmDialog
        open={pendingGoalRemove !== null}
        danger
        title={t("project.goal.delete.confirm.title")}
        message={t("project.goal.delete.confirm")}
        detail={pendingGoalRemove !== null ? goals[pendingGoalRemove]?.text : undefined}
        confirmLabel={t("common.delete")}
        onConfirm={() => { if (pendingGoalRemove !== null) removeGoal(pendingGoalRemove); setPendingGoalRemove(null); }}
        onCancel={() => setPendingGoalRemove(null)}
      />
    </div>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
      <IconArrowLeft size={14} />
      {label}
    </button>
  );
}

/** A key-goal row: a numeric KPI (progress bar + editable current) when it has
 * a target, otherwise a plain checkbox objective. */
function GoalItem({
  goal,
  deleteLabel,
  onToggle,
  onRemove,
  onSetCurrent,
  onCycleConfidence,
}: {
  goal: ProjectGoal;
  deleteLabel: string;
  onToggle: () => void;
  onRemove: () => void;
  onSetCurrent: (v: number) => void;
  onCycleConfidence: () => void;
}) {
  const t = useT();
  // Default an unset current to the baseline (matching goalPct), so the editor
  // and the progress bar agree for a KPI goal that hasn't been checked in yet.
  const goalCurrent = goal.current ?? goal.start ?? 0;
  const [curDraft, setCurDraft] = useState(String(goalCurrent));
  useEffect(() => { setCurDraft(String(goalCurrent)); }, [goalCurrent]);

  if (!isKpiGoal(goal)) {
    return (
      <div className="flex items-center gap-2 group">
        <button
          role="checkbox"
          aria-checked={goal.done}
          aria-label={goal.text}
          onClick={onToggle}
          className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded transition-all"
          style={{
            border: `1px solid ${goal.done ? "var(--accent-primary)" : "var(--border-strong)"}`,
            background: goal.done ? "var(--accent-primary)" : "transparent",
            color: "var(--text-inverse)",
          }}
        >
          {goal.done && <IconCheck size={11} strokeWidth={2.5} />}
        </button>
        <span className="flex-1 text-sm" style={{ color: goal.done ? "var(--text-faint)" : "var(--text-primary)", textDecoration: goal.done ? "line-through" : "none" }}>
          {goal.text}
        </span>
        <button
          onClick={onRemove}
          aria-label={`${deleteLabel}: ${goal.text}`}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-text-faint hover:text-text-secondary transition-opacity"
        >
          <IconClose size={13} />
        </button>
      </div>
    );
  }

  const pct = goalPct(goal);
  function commitCurrent() {
    const n = Number(curDraft.trim());
    onSetCurrent(Number.isFinite(n) ? n : 0);
  }
  return (
    <div className="group rounded-lg p-2.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="flex-1 text-sm font-medium text-text-primary truncate">{goal.text}</span>
        <button
          type="button"
          onClick={onCycleConfidence}
          aria-label={`${t("project.goal.confidence.set")}: ${goal.text}`}
          className="flex-shrink-0 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors"
          style={goal.confidence
            ? { border: `1px solid ${CONFIDENCE_COLOR[goal.confidence]}`, color: CONFIDENCE_COLOR[goal.confidence] }
            : { border: "1px dashed var(--border-strong)", color: "var(--text-faint)" }}
        >
          {goal.confidence && (
            <span className="rounded-full" style={{ width: 6, height: 6, background: CONFIDENCE_COLOR[goal.confidence] }} />
          )}
          {goal.confidence ? t(`project.goal.confidence.${goal.confidence}`) : t("project.goal.confidence.set")}
        </button>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--accent-primary)" }}>{pct}%</span>
        <button
          onClick={onRemove}
          aria-label={`${deleteLabel}: ${goal.text}`}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-text-faint hover:text-text-secondary transition-opacity"
        >
          <IconClose size={13} />
        </button>
      </div>
      <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--border-default)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent-primary)" }} />
      </div>
      <div className="flex items-center gap-1 text-xs text-text-muted tabular-nums">
        {goal.start ? <span className="text-text-faint">{goal.start} →</span> : null}
        <input
          type="number"
          min={0}
          value={curDraft}
          onChange={(e) => setCurDraft(e.target.value)}
          onBlur={commitCurrent}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          aria-label={goal.text}
          className="inline-input w-16 text-xs tabular-nums"
        />
        <span>/ {goal.target}{goal.unit ? ` ${goal.unit}` : ""}</span>
      </div>
    </div>
  );
}

/** Small ✓ button shown next to a header field once its draft has changed. */
function ConfirmEditBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors"
      style={{ background: "var(--accent-primary)", color: "var(--text-inverse)" }}
    >
      <IconCheck size={13} strokeWidth={2.5} />
    </button>
  );
}

function OverviewStat({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="leading-tight">
      <div className="text-lg font-semibold tabular-nums text-text-primary">
        {icon && <span className="mr-1">{icon}</span>}
        {value}
      </div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">{title}</div>
        {extra}
      </div>
      {children}
    </section>
  );
}
