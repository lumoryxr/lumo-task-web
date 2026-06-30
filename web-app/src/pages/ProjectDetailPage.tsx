import { useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { ProjectColor, ProjectGoal } from "@/types/task";
import { TaskRow } from "@/components/TaskRow";
import { EmptyState } from "@/components/EmptyState";
import { IconArrowLeft, IconCheck, IconClose, IconPlus, IconProject, IconTrash } from "@/components/icons";

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

  const [newGoal, setNewGoal] = useState("");
  const [newTask, setNewTask] = useState("");

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

  const primary = COLOR_PRIMARY[project.color];

  return (
    <div className="fade-in px-4 sm:px-7 py-6 sm:py-7 max-w-3xl">
      <BackLink onClick={() => navigate("/projects")} label={t("project.page.title")} />

      {/* Header */}
      <div className="flex items-start gap-3 mt-3 mb-6">
        <input
          aria-label={t("project.field.emoji")}
          value={project.emoji ?? ""}
          onChange={(e) => update(project.id, { emoji: e.target.value || undefined })}
          placeholder="📁"
          className="flex-shrink-0 text-center text-xl rounded-lg"
          style={{ width: 44, height: 44, background: primary, color: "var(--text-inverse)", border: "none" }}
          maxLength={4}
        />
        <div className="flex-1 min-w-0">
          <input
            aria-label={t("project.field.name")}
            value={project.name}
            onChange={(e) => update(project.id, { name: e.target.value || t("project.untitled") })}
            placeholder={t("project.field.namePlaceholder")}
            className="w-full text-lg font-semibold text-text-primary bg-transparent outline-none"
          />
          <input
            aria-label={t("project.category.label")}
            value={project.category ?? ""}
            onChange={(e) => update(project.id, { category: e.target.value || undefined })}
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
      <Section title={t("project.tasks.title")}>
        {projectTasks.length === 0 && <p className="text-xs text-text-faint mb-2">{t("project.tasks.empty")}</p>}
        <div>
          {projectTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
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

      {/* Content (plain textarea until #215 brings TipTap) */}
      <Section title={t("project.content.title")}>
        <textarea
          aria-label={t("project.content.title")}
          value={project.content ?? ""}
          onChange={(e) => update(project.id, { content: e.target.value || undefined })}
          placeholder={t("project.content.placeholder")}
          rows={6}
          className="w-full text-sm rounded-lg p-3 bg-transparent outline-none resize-y"
          style={{ border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        />
      </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint mb-2.5">{title}</div>
      {children}
    </section>
  );
}
