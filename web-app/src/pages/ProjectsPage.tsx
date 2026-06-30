import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { Project, ProjectColor } from "@/types/task";
import { EmptyState } from "@/components/EmptyState";
import { IconProject, IconPlus } from "@/components/icons";

const COLOR_PRIMARY: Record<ProjectColor, string> = {
  green: "var(--accent-primary)",
  cyan: "var(--status-info)",
  amber: "var(--status-warning)",
  red: "var(--status-urgent)",
};

export function ProjectsPage() {
  const t = useT();
  const navigate = useNavigate();
  const projects = useProjectsStore((s) => s.projects);
  const createProject = useProjectsStore((s) => s.create);
  const doneCounts = useProjectsStore((s) => s.doneCounts);
  const loadProgress = useProjectsStore((s) => s.loadProgress);
  const tasks = useTasksStore((s) => s.tasks);
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Real done/total ring (#223): completed counts come from the server.
  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  // Active (incomplete) task count per project, from the live task cache.
  const taskCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tk of tasks) {
      if (tk.project_id && !tk.completed) m.set(tk.project_id, (m.get(tk.project_id) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const categories = useMemo(
    () => [...new Set(projects.map((p) => p.category).filter(Boolean) as string[])].sort(),
    [projects]
  );

  const visible = category
    ? projects.filter((p) => (p.category ?? null) === (category === "__none__" ? null : category))
    : projects;

  async function handleNew() {
    if (busy) return;
    setBusy(true);
    try {
      const p = await createProject({ name: t("project.untitled"), color: "green", goals: [], status: "active" });
      navigate(`/projects/${p.id}`);
    } finally {
      setBusy(false);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
        <Header onNew={handleNew} busy={busy} t={t} />
        <EmptyState
          icon={<IconProject size={28} />}
          title={t("project.empty.title")}
          subtitle={t("project.empty.subtitle")}
          cta={{ label: t("project.new"), onClick: handleNew }}
        />
      </div>
    );
  }

  return (
    <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
      <Header onNew={handleNew} busy={busy} t={t} />

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="group" aria-label={t("project.category.label")}>
          <CatChip label={t("project.category.all")} active={!category} onClick={() => setCategory(null)} />
          {categories.map((cat) => (
            <CatChip key={cat} label={cat} active={category === cat} onClick={() => setCategory(category === cat ? null : cat)} />
          ))}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {visible.map((p) => (
          <ProjectCard key={p.id} project={p} taskCount={taskCounts.get(p.id) ?? 0} doneCount={doneCounts[p.id] ?? 0} onOpen={() => navigate(`/projects/${p.id}`)} t={t} />
        ))}
      </div>
    </div>
  );
}

function Header({ onNew, busy, t }: { onNew: () => void; busy: boolean; t: (k: string) => string }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-xl font-semibold text-text-primary">{t("project.page.title")}</h1>
      <button
        onClick={onNew}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        style={{ color: "var(--accent-primary)", background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
      >
        <IconPlus size={14} />
        {t("project.new")}
      </button>
    </div>
  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
        background: active ? "var(--accent-fog)" : "var(--bg-subtle)",
        border: `1px solid ${active ? "var(--accent-edge)" : "var(--border-default)"}`,
      }}
    >
      {label}
    </button>
  );
}

function ProjectCard({ project, taskCount, doneCount, onOpen, t }: { project: Project; taskCount: number; doneCount: number; onOpen: () => void; t: (k: string) => string }) {
  const primary = COLOR_PRIMARY[project.color];
  const goalsDone = project.goals.filter((g) => g.done).length;
  // Real task progress (#223): done = completed entries snapshotted to this
  // project; total = those plus still-active tasks in the live cache.
  const total = doneCount + taskCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl p-4 transition-all hover:-translate-y-0.5"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="flex items-center justify-center rounded-lg text-lg"
          style={{ width: 38, height: 38, background: primary, color: "var(--text-inverse)" }}
        >
          {project.emoji || "📁"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary truncate">{project.name}</div>
          {project.category && <div className="text-xs text-text-muted truncate">{project.category}</div>}
        </div>
        {total > 0 && <ProgressRing pct={pct} color={primary} />}
      </div>
      <div className="flex items-center gap-3 text-xs text-text-muted tabular-nums">
        <span title={t("project.progress.label")}>{doneCount}/{total} · {t("project.tasks.title")}</span>
        {project.goals.length > 0 && (
          <span style={{ color: goalsDone === project.goals.length ? "var(--accent-primary)" : undefined }}>
            🎯 {goalsDone}/{project.goals.length}
          </span>
        )}
        {project.status === "archived" && <span style={{ color: "var(--text-faint)" }}>{t("project.status.archived")}</span>}
      </div>
    </button>
  );
}

/** Compact SVG donut showing a project's completion percentage. */
function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" className="shrink-0" aria-hidden="true">
      <circle cx={13} cy={13} r={r} fill="none" stroke="var(--border-default)" strokeWidth={3} />
      <circle
        cx={13} cy={13} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 13 13)"
      />
    </svg>
  );
}
