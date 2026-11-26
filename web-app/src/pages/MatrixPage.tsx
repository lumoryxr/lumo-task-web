import { useState } from "react";
import { useTasksStore } from "@/store/useTasksStore";
import { useTaskDrop, makeDragProps } from "@/lib/taskDnd";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import type { Quadrant, Task } from "@/types/task";
import { useAppStore } from "@/store/useAppStore";
import { IconPlus, IconSparkle } from "@/components/icons";
import { TaskRow } from "@/components/TaskRow";
import { useShellOutlet } from "@/components/shellOutletContext";
import { AIClassifyModal } from "@/components/AIClassifyModal";
import { useProjectsStore } from "@/store/useProjectsStore";
import { FilterChip } from "@/components/FilterChip";
import { CalendarView } from "@/components/CalendarView";
import { MatrixSkeleton } from "@/components/skeletons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { derivePlanProjects, resolveActiveFilter, filterPlanTasks } from "@/utils/planFilters";

/**
 * Eisenhower 2×2. Each quadrant is a column with a header and a stack
 * of compact task cards. Unclassified tasks live in a top toolbar strip
 * alongside the AI classify button (both at the same visual level).
 *
 * Drag a card from any quadrant (or from the Unclassified strip) onto
 * another quadrant to reassign. The target quadrant highlights on dragover.
 */
type ViewMode = "matrix" | "calendar";

export function MatrixPage() {
  const t = useT();
  const { openQuickCreate } = useShellOutlet();
  const isMobile = useIsMobile();
  const tasks = useTasksStore((s) => s.tasks);
  const loading = useTasksStore((s) => s.loading);
  const unclassified = tasks.filter((x) => x.quadrant === "unclassified" && !x.completed);
  const allActive = tasks.filter((x) => !x.completed);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const projects = useProjectsStore((s) => s.projects);
  const view = useAppStore((s) => s.matrixView) as ViewMode;
  const setMatrixView = useAppStore((s) => s.setMatrixView);

  // Distinct projects across all active tasks (#211 V2 ⭐2, mirrors Today).
  // A filter that no longer matches any active task is auto-dropped so the
  // quadrants never get stuck showing an empty board with no way back.
  const boardProjects = derivePlanProjects(allActive, projects);
  const activeProject = resolveActiveFilter(projectFilter, boardProjects.map((p) => p.id));

  function switchView(v: ViewMode) {
    setMatrixView(v);
  }

  const quadrants: Array<{ id: Quadrant; label: string; sub: string }> = [
    { id: "Q1", label: t("matrix.q1"), sub: t("matrix.q1.sub") },
    { id: "Q2", label: t("matrix.q2"), sub: t("matrix.q2.sub") },
    { id: "Q3", label: t("matrix.q3"), sub: t("matrix.q3.sub") },
    { id: "Q4", label: t("matrix.q4"), sub: t("matrix.q4.sub") },
  ];

  // First paint while tasks are still loading and nothing is cached: show the
  // quadrant skeleton instead of an empty grid (matches Today / Stats, #95).
  if (loading && tasks.length === 0) {
    return <MatrixSkeleton />;
  }

  return (
    <div className="fade-in flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0 px-4 sm:px-7 pt-5 sm:pt-7 pb-4">
        {/* Create task — explicit primary action, first in the toolbar so it
            reads as the main thing to do on this board. */}
        <button
          className="btn btn-primary flex-shrink-0"
          onClick={() => openQuickCreate()}
          aria-label={t("action.newTask")}
        >
          <IconPlus size={14} />
          {t("action.newTask")}
        </button>
        {view === "matrix" ? (
          <>
            {isMobile ? (
              unclassified.length > 0 && (
                <span className="chip flex-shrink-0" style={{ fontSize: 11 }}>
                  {t("matrix.unclassified")} · {unclassified.length}
                </span>
              )
            ) : (
              <UnclassifiedBar unclassified={unclassified} label={t("matrix.unclassified")} />
            )}
            <button
              className="btn btn-secondary flex-shrink-0"
              onClick={() => setClassifyOpen(true)}
              disabled={allActive.length === 0}
            >
              <IconSparkle size={14} />
              {!isMobile && t("matrix.aiClassify")}
              {allActive.length > 0 && (
                <span className="ml-1 text-[11px] text-text-faint tabular-nums">
                  · {allActive.length}
                </span>
              )}
            </button>
          </>
        ) : (
          <div className="flex-1" />
        )}

        {/* View toggle — segmented control */}
        <div
          className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
          style={{ border: "1px solid var(--border-default)" }}
        >
          <ViewToggleBtn
            active={view === "matrix"}
            onClick={() => switchView("matrix")}
            icon={
              <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
                <rect x="0" y="0" width="4.5" height="4.5" rx="1" opacity="0.85" />
                <rect x="6.5" y="0" width="4.5" height="4.5" rx="1" opacity="0.85" />
                <rect x="0" y="6.5" width="4.5" height="4.5" rx="1" opacity="0.5" />
                <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="1" opacity="0.5" />
              </svg>
            }
            label={t("matrix.view.matrix")}
          />
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border-default)" }} />
          <ViewToggleBtn
            active={view === "calendar"}
            onClick={() => switchView("calendar")}
            icon={
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <rect x="0.5" y="1.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
                <path d="M0.5 4.5h11" stroke="currentColor" strokeWidth="1.1" />
                <circle cx="4" cy="7.5" r="1" fill="currentColor" opacity="0.7" />
                <circle cx="8" cy="7.5" r="1" fill="currentColor" opacity="0.7" />
              </svg>
            }
            label={t("matrix.view.calendar")}
          />
        </div>
      </div>

      {/* Project filter bar — only in matrix view, only when tasks span projects */}
      {view === "matrix" && boardProjects.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 flex-shrink-0 px-4 sm:px-7 pb-3"
          role="group"
          aria-label={t("project.filter.label")}
        >
          <FilterChip
            label={t("project.filter.all")}
            active={!activeProject}
            onClick={() => setProjectFilter(null)}
          />
          {boardProjects.map((p) => (
            <FilterChip
              key={p.id}
              label={p.name}
              active={activeProject === p.id}
              onClick={() => setProjectFilter(activeProject === p.id ? null : p.id)}
            />
          ))}
        </div>
      )}

      {/* Content area */}
      {view === "matrix" ? (
        <div className="grid grid-cols-1 auto-rows-max sm:grid-cols-2 sm:grid-rows-[repeat(2,minmax(220px,1fr))] gap-3 sm:gap-4 flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 pb-4 sm:pb-7">
          {/* 2×2 on wider screens: the quadrants share the window's height, each
              scrolling its own list, but never get shorter than 220px — on a short
              window the board itself scrolls instead of squeezing them. */}
          {quadrants.map((q) => (
            <QuadrantPanel
              key={q.id}
              id={q.id}
              title={q.label}
              subtitle={q.sub}
              projectFilter={activeProject}
              onAdd={() => openQuickCreate({ quadrant: q.id })}
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <CalendarView />
        </div>
      )}

      {classifyOpen && <AIClassifyModal onClose={() => setClassifyOpen(false)} />}
    </div>
  );
}

function ViewToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 transition-colors"
      style={{
        padding: "5px 11px",
        fontSize: 12,
        fontWeight: 500,
        background: active ? "var(--bg-elevated)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Unclassified bar — drop zone + horizontal chip list ─────────── */

function UnclassifiedBar({ unclassified, label }: { unclassified: Task[]; label: string }) {
  const t = useT();
  const { over, handlers } = useTaskDrop("unclassified");

  return (
    <div
      {...handlers}
      className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border px-3 transition-all overflow-hidden"
      style={{
        height: 38,
        borderStyle: unclassified.length === 0 ? "dashed" : "solid",
        borderColor: over ? "var(--accent-edge)" : "var(--border-faint)",
        background: over ? "var(--accent-fog)" : "transparent",
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint flex-shrink-0">
        {label}
        {unclassified.length > 0 && (
          <span className="ml-1.5 font-normal text-text-muted">{unclassified.length}</span>
        )}
      </span>
      {unclassified.length === 0 ? (
        <span className="text-[11px] text-text-faint italic ml-1">
          {over ? t("matrix.dropHere") : "—"}
        </span>
      ) : (
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
          {unclassified.map((task) => (
            <UnclassifiedChip key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}


/* ── Quadrant panel ───────────────────────────────────────────────── */

function QuadrantPanel({
  id,
  title,
  subtitle,
  projectFilter,
  onAdd,
}: {
  id: Quadrant;
  title: string;
  subtitle: string;
  projectFilter: string | null;
  onAdd: () => void;
}) {
  const all = useTasksStore((s) => s.byQuadrant(id));
  const tasks = filterPlanTasks(all, null, projectFilter);
  const t = useT();
  const { over, handlers } = useTaskDrop(id);

  return (
    <div
      {...handlers}
      className="flex flex-col sm:min-h-0 rounded-xl border bg-surface overflow-hidden transition-all"
      style={{
        borderColor: over ? "var(--accent-edge)" : "var(--border-default)",
        boxShadow: over ? "0 0 0 2px var(--accent-fog), inset 0 0 30px var(--accent-fog)" : "none",
      }}
    >
      <header
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border-faint)" }}
      >
        <span className={`qdot qdot-${id.toLowerCase()}`} />
        <span className="text-[13px] font-semibold text-text-primary">
          {id} · {title}
        </span>
        <span className="text-[11px] text-text-faint ml-1">{subtitle}</span>
        <span className="ml-auto text-[11px] tabular-nums text-text-muted">{tasks.length}</span>
        <button
          onClick={onAdd}
          aria-label={t("matrix.quadrantAdd")}
          title={t("matrix.quadrantAdd")}
          className="flex items-center justify-center w-6 h-6 rounded-md text-text-secondary hover:bg-subtle hover:text-text-primary transition-colors"
        >
          <IconPlus size={14} />
        </button>
      </header>

      {/* Stacked on a phone, a quadrant grows with its tasks (the page scrolls);
          in the 2×2 grid each quadrant scrolls on its own. */}
      <div data-quadrant-list className="quadrant-list p-3 flex flex-col gap-2">
        {tasks.length === 0 && (
          <div className="text-[12px] text-text-faint italic px-1 py-3">
            {over ? t("matrix.dropHere") : t("matrix.empty")}
          </div>
        )}
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} variant="card" />
        ))}
      </div>
    </div>
  );
}

function UnclassifiedChip({ task }: { task: Task }) {
  const ls = useLocaleString();
  return (
    <div
      {...makeDragProps(task.id)}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-deep text-text-secondary text-[12px] cursor-grab active:cursor-grabbing flex-shrink-0 whitespace-nowrap"
      style={{ borderColor: "var(--border-faint)" }}
    >
      <span className="qdot qdot-un" />
      <span><TaskTitle text={ls(task.title)} /></span>
      {task.ai_suggest && <span className="chip chip-ai">AI → {task.ai_suggest}</span>}
    </div>
  );
}
