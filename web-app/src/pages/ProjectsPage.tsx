import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { Project, ProjectColor } from "@/types/task";
import { EmptyState } from "@/components/EmptyState";
import { ProjectListSkeleton } from "@/components/skeletons";
import { ProjectTemplatePicker } from "@/components/ProjectTemplatePicker";
import { ProjectFormModal } from "@/components/ProjectFormModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProgressRing } from "@/components/ProgressRing";
import { sortProjects, type ProjectSort } from "@/utils/projectSort";
import { IconProject, IconPlus, IconBookmark, IconMore, IconEdit, IconTrash, IconArrowRight } from "@/components/icons";

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
  const loaded = useProjectsStore((s) => s.loaded);
  const removeProject = useProjectsStore((s) => s.remove);
  const doneCounts = useProjectsStore((s) => s.doneCounts);
  const loadProgress = useProjectsStore((s) => s.loadProgress);
  const tasks = useTasksStore((s) => s.tasks);
  const [category, setCategory] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [showArchived, setShowArchived] = useState(false);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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

  // Completion percentage per project, for progress-sort (mirrors the card ring).
  const pctOf = (pid: string) => {
    const done = doneCounts[pid] ?? 0;
    const total = done + (taskCounts.get(pid) ?? 0);
    return total > 0 ? (done / total) * 100 : 0;
  };

  const filtered = category
    ? projects.filter((p) => (p.category ?? null) === (category === "__none__" ? null : category))
    : projects;

  // Active projects fill the grid; archived ones live in a separate section so
  // they never clutter the main view (#211 V2 ⭐6).
  const active = sortProjects(filtered.filter((p) => p.status !== "archived"), sort, pctOf);
  const archived = sortProjects(filtered.filter((p) => p.status === "archived"), sort, pctOf);

  function handleNew() {
    setCreateOpen(true);
  }

  // First paint while projects are still loading and nothing is cached: show a
  // content-shaped skeleton instead of flashing the empty state (mirrors the
  // habits fix #285).
  if (!loaded && projects.length === 0) {
    return (
      <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
        <Header onNew={handleNew} onFromTemplate={() => setPickerOpen(true)} t={t} />
        <div className="mt-4">
          <ProjectListSkeleton />
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
        <Header onNew={handleNew} onFromTemplate={() => setPickerOpen(true)} t={t} />
        <EmptyState
          icon={<IconProject size={28} />}
          title={t("project.empty.title")}
          subtitle={t("project.empty.subtitle")}
          cta={{ label: t("project.new"), onClick: handleNew }}
        />
        {pickerOpen && (
          <ProjectTemplatePicker
            onClose={() => setPickerOpen(false)}
            onCreated={(p) => navigate(`/projects/${p.id}`)}
          />
        )}
        {createOpen && (
          <ProjectFormModal
            onClose={() => setCreateOpen(false)}
            onCreated={(p) => navigate(`/projects/${p.id}`)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
      <Header onNew={handleNew} onFromTemplate={() => setPickerOpen(true)} t={t} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("project.category.label")}>
            <CatChip label={t("project.category.all")} active={!category} onClick={() => setCategory(null)} />
            {categories.map((cat) => (
              <CatChip key={cat} label={cat} active={category === cat} onClick={() => setCategory(category === cat ? null : cat)} />
            ))}
          </div>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          {t("project.sort.label")}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ProjectSort)}
            aria-label={t("project.sort.label")}
            className="text-xs bg-transparent text-text-secondary rounded-md px-1.5 py-1 outline-none"
            style={{ border: "1px solid var(--border-default)" }}
          >
            <option value="recent">{t("project.sort.recent")}</option>
            <option value="name">{t("project.sort.name")}</option>
            <option value="progress">{t("project.sort.progress")}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {active.map((p) => (
          <ProjectCard key={p.id} project={p} taskCount={taskCounts.get(p.id) ?? 0} doneCount={doneCounts[p.id] ?? 0} onOpen={() => navigate(`/projects/${p.id}`)} onEdit={() => setEditTarget(p)} onDelete={() => setDeleteTarget(p)} t={t} />
        ))}
      </div>

      {active.length === 0 && (
        <p className="text-sm text-text-faint py-6">{t("project.active.empty")}</p>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint hover:text-text-secondary transition-colors mb-3"
          >
            {showArchived ? "▾" : "▸"} {t("project.archived.section")} · {archived.length}
          </button>
          {showArchived && (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {archived.map((p) => (
                <ProjectCard key={p.id} project={p} taskCount={taskCounts.get(p.id) ?? 0} doneCount={doneCounts[p.id] ?? 0} onOpen={() => navigate(`/projects/${p.id}`)} onEdit={() => setEditTarget(p)} onDelete={() => setDeleteTarget(p)} t={t} />
              ))}
            </div>
          )}
        </section>
      )}

      {pickerOpen && (
        <ProjectTemplatePicker
          onClose={() => setPickerOpen(false)}
          onCreated={(p) => navigate(`/projects/${p.id}`)}
        />
      )}
      {createOpen && (
        <ProjectFormModal
          onClose={() => setCreateOpen(false)}
          onCreated={(p) => navigate(`/projects/${p.id}`)}
        />
      )}
      {editTarget && (
        <ProjectFormModal
          project={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        danger
        title={t("project.deleteConfirm.title")}
        message={t("project.deleteConfirm")}
        detail={deleteTarget?.name}
        confirmLabel={t("project.delete")}
        onConfirm={() => { if (deleteTarget) void removeProject(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Header({ onNew, onFromTemplate, t }: { onNew: () => void; onFromTemplate: () => void; t: (k: string) => string }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-xl font-semibold text-text-primary">{t("project.page.title")}</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={onFromTemplate}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
        >
          <IconBookmark size={14} />
          {t("project.fromTemplate")}
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ color: "var(--accent-primary)", background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
        >
          <IconPlus size={14} />
          {t("project.new")}
        </button>
      </div>
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

function ProjectCard({ project, taskCount, doneCount, onOpen, onEdit, onDelete, t }: { project: Project; taskCount: number; doneCount: number; onOpen: () => void; onEdit: () => void; onDelete: () => void; t: (k: string) => string }) {
  const primary = COLOR_PRIMARY[project.color];
  const goalsDone = project.goals.filter((g) => g.done).length;
  // Real task progress (#223): done = completed entries snapshotted to this
  // project; total = those plus still-active tasks in the live cache.
  const total = doneCount + taskCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  return (
    <div className="relative group">
      {/* Actions menu — hover/focus-revealed, sibling overlay (not nested) so the
          whole-card button stays valid HTML. */}
      <div ref={menuRef} className="absolute top-2 right-2 z-10">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("project.menu")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex items-center justify-center w-6 h-6 rounded-md transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
          style={{ color: "var(--text-muted)", background: menuOpen ? "var(--bg-subtle)" : "transparent" }}
        >
          <IconMore size={15} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute top-7 right-0 py-1 rounded-lg overflow-hidden"
            style={{ minWidth: 132, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lifted)" }}
          >
            <MenuItem icon={<IconArrowRight size={13} />} label={t("project.view")} onClick={() => { setMenuOpen(false); onOpen(); }} />
            <MenuItem icon={<IconEdit size={13} />} label={t("project.edit")} onClick={() => { setMenuOpen(false); onEdit(); }} />
            <MenuItem icon={<IconTrash size={13} />} label={t("project.delete")} danger onClick={() => { setMenuOpen(false); onDelete(); }} />
          </div>
        )}
      </div>
      <button
        onClick={onOpen}
        className="w-full text-left rounded-xl p-4 transition-all hover:-translate-y-0.5"
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
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-bg-subtle"
      style={{ color: danger ? "var(--status-urgent)" : "var(--text-primary)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
