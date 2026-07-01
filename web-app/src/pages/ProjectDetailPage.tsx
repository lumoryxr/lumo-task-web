import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Project, ProjectColor, ProjectGoal } from "@/types/task";
import { TaskRow } from "@/components/TaskRow";
import { ProjectBoard } from "@/components/ProjectBoard";
import { ProjectContentEditor } from "@/components/ProjectContentEditor";
import { ProjectRecapCard } from "@/components/ProjectRecapCard";
import { EmptyState } from "@/components/EmptyState";
import { computeProjectRecap } from "@/utils/projectRecap";
import { IconArrowLeft, IconBookmark, IconCheck, IconClose, IconPlus, IconProject, IconShare, IconTrash } from "@/components/icons";

const COLORS: ProjectColor[] = ["green", "cyan", "amber", "red"];
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
  const [recapOpen, setRecapOpen] = useState(false);
  const [taskView, setTaskView] = useState<"list" | "board">("list");

  const [newGoal, setNewGoal] = useState("");
  const [newTask, setNewTask] = useState("");

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

  // Commit header edits only on blur/Enter, and only when actually changed —
  // an empty name falls back to "Untitled" at commit time (not while typing).
  function commitName(v: string) {
    const name = v.trim() || t("project.untitled");
    if (name !== project!.name) update(pid, { name });
  }
  function commitCategory(v: string) {
    const category = v.trim() || undefined;
    if ((category ?? "") !== (project!.category ?? "")) update(pid, { category });
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
    setGoals([...goals, { text, done: false }]);
    setNewGoal("");
  }
  function toggleGoal(i: number) {
    setGoals(goals.map((g, idx) => (idx === i ? { ...g, done: !g.done } : g)));
  }
  function removeGoal(i: number) {
    setGoals(goals.filter((_, idx) => idx !== i));
  }

  async function addTask() {
    const text = newTask.trim();
    if (!text) return;
    setNewTask("");
    await createTask({ title: { en: text }, project_id: pid });
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

  return (
    <div className="fade-in px-4 sm:px-7 py-6 sm:py-7 max-w-3xl">
      <BackLink onClick={() => navigate("/projects")} label={t("project.page.title")} />

      {/* Header — uncontrolled inputs that commit on blur/Enter (keyed by
          project.id so they reset when switching projects). This fixes the
          rename bug where clearing the field snapped it back to "Untitled"
          mid-type, and stops a backend PATCH firing on every keystroke. */}
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
          <input
            key={`${pid}-name`}
            aria-label={t("project.field.name")}
            defaultValue={project.name}
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={t("project.field.namePlaceholder")}
            className="w-full text-lg font-semibold text-text-primary bg-transparent outline-none"
          />
          <input
            key={`${pid}-category`}
            aria-label={t("project.category.label")}
            defaultValue={project.category ?? ""}
            onBlur={(e) => commitCategory(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={t("project.category.placeholder")}
            className="w-full text-xs text-text-muted bg-transparent outline-none mt-0.5"
          />
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
          onClick={() => update(project.id, { status: project.status === "archived" ? "active" : "archived" })}
          className="text-xs px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
        >
          {project.status === "archived" ? t("project.unarchive") : t("project.archive")}
        </button>
        <button
          onClick={() => {
            if (window.confirm(t("project.deleteConfirm"))) {
              remove(project.id);
              navigate("/projects");
            }
          }}
          aria-label={t("project.delete")}
          title={t("project.delete")}
          className="flex items-center justify-center w-[28px] h-[26px] rounded-md transition-colors"
          style={{ color: "var(--status-urgent)", border: "1px solid var(--border-default)" }}
        >
          <IconTrash size={13} />
        </button>
      </div>

      {/* Key goals */}
      <Section title={t("project.goals.title")}>
        {goals.length === 0 && <p className="text-xs text-text-faint mb-2">{t("project.goals.empty")}</p>}
        <div className="flex flex-col gap-1.5 mb-2">
          {goals.map((g, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <button
                role="checkbox"
                aria-checked={g.done}
                aria-label={g.text}
                onClick={() => toggleGoal(i)}
                className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded transition-all"
                style={{
                  border: `1.5px solid ${g.done ? "var(--accent-primary)" : "var(--border-strong)"}`,
                  background: g.done ? "var(--accent-primary)" : "transparent",
                  color: "var(--text-inverse)",
                }}
              >
                {g.done && <IconCheck size={11} strokeWidth={2.5} />}
              </button>
              <span className="flex-1 text-sm" style={{ color: g.done ? "var(--text-faint)" : "var(--text-primary)", textDecoration: g.done ? "line-through" : "none" }}>
                {g.text}
              </span>
              <button
                onClick={() => removeGoal(i)}
                aria-label={`${t("project.delete")}: ${g.text}`}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-text-faint hover:text-text-secondary transition-opacity"
              >
                <IconClose size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => onEnter(e, addGoal)}
            placeholder={t("project.goals.placeholder")}
            className="flex-1 text-sm bg-transparent outline-none border-b py-1"
            style={{ borderColor: "var(--border-faint)" }}
          />
          <button onClick={addGoal} aria-label={t("project.goals.add")} className="text-text-secondary hover:text-text-primary transition-colors">
            <IconPlus size={16} />
          </button>
        </div>
      </Section>

      {/* Tasks */}
      <Section
        title={t("project.tasks.title")}
        extra={
          <div className="flex items-center gap-2 normal-case tracking-normal">
            {doneCount + projectTasks.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-text-muted">
                {doneCount}/{doneCount + projectTasks.length}
              </span>
            )}
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
            className="flex-1 text-sm bg-transparent outline-none border-b py-1"
            style={{ borderColor: "var(--border-faint)" }}
          />
          <button onClick={addTask} aria-label={t("project.tasks.add")} className="text-text-secondary hover:text-text-primary transition-colors">
            <IconPlus size={16} />
          </button>
        </div>
      </Section>

      {/* Content — rich text with inline images (#215) */}
      <Section title={t("project.content.title")}>
        <ProjectContentEditor
          value={project.content}
          onChange={(json) => update(pid, { content: json || undefined })}
        />
      </Section>

      {recapOpen && (
        <ProjectRecapCard
          project={project}
          recap={computeProjectRecap(project, doneCount, projectTasks.length, focusMinutes)}
          userName={userName}
          onClose={() => setRecapOpen(false)}
        />
      )}
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
