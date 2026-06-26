import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTasksStore } from "@/store/useTasksStore";
import { useT, useLocaleString } from "@/i18n/useT";
import type { Quadrant, Task } from "@/types/task";
import { useAppStore } from "@/store/useAppStore";
import { fmtDuration, getDueLabel } from "@/lib/format";
import { IconArrowRight, IconCheck, IconMore, IconSparkle } from "@/components/icons";
import { AIClassifyModal } from "@/components/AIClassifyModal";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskEditModal } from "@/components/TaskEditModal";
import { TaskMoreMenu } from "@/components/TaskMoreMenu";
import { usePeopleStore } from "@/store/usePeopleStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CalendarView } from "@/components/CalendarView";
import { MatrixSkeleton } from "@/components/skeletons";
import { useIsMobile } from "@/hooks/useIsMobile";

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
  const isMobile = useIsMobile();
  const tasks = useTasksStore((s) => s.tasks);
  const loading = useTasksStore((s) => s.loading);
  const unclassified = tasks.filter((x) => x.quadrant === "unclassified" && !x.completed);
  const allActive = tasks.filter((x) => !x.completed);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const view = useAppStore((s) => s.matrixView) as ViewMode;
  const setMatrixView = useAppStore((s) => s.setMatrixView);

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
      <div className="flex items-center gap-3 flex-shrink-0 px-7 pt-7 pb-4">
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

      {/* Content area */}
      {view === "matrix" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-2 gap-3 sm:gap-4 flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 pb-4 sm:pb-7">
          {quadrants.map((q) => (
            <QuadrantPanel key={q.id} id={q.id} title={q.label} subtitle={q.sub} />
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

/* ── DnD helpers ──────────────────────────────────────────────────── */

const DND_MIME = "application/x-lumo-task";

function useTaskDrop(target: Quadrant | "unclassified") {
  const update = useTasksStore((s) => s.update);
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DND_MIME);
        if (!id) return;
        update(id, { quadrant: target as Task["quadrant"] });
      },
    },
  };
}

function makeDragProps(taskId: string) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DND_MIME, taskId);
      (e.currentTarget as HTMLElement).style.opacity = "0.4";
    },
    onDragEnd: (e: React.DragEvent) => {
      (e.currentTarget as HTMLElement).style.opacity = "1";
    },
  };
}

/* ── Quadrant panel ───────────────────────────────────────────────── */

function QuadrantPanel({ id, title, subtitle }: { id: Quadrant; title: string; subtitle: string }) {
  const tasks = useTasksStore((s) => s.byQuadrant(id));
  const t = useT();
  const { over, handlers } = useTaskDrop(id);

  return (
    <div
      {...handlers}
      className="flex flex-col min-h-0 rounded-xl border bg-surface overflow-hidden transition-all"
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
      </header>

      <div className="flex-1 min-h-0 scroll-y p-3 flex flex-col gap-1.5">
        {tasks.length === 0 && (
          <div className="text-[12px] text-text-faint italic px-1 py-3">
            {over ? t("matrix.dropHere") : t("matrix.empty")}
          </div>
        )}
        {tasks.map((task) => (
          <MatrixTaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

/* ── Matrix task card — TaskRow style + drag-and-drop ────────────── */

function MatrixTaskCard({ task }: { task: Task }) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const navigate = useNavigate();
  const byId = usePeopleStore((s) => s.byId);
  const complete = useTasksStore((s) => s.complete);
  const remove = useTasksStore((s) => s.remove);

  const [hovered, setHovered] = useState(false);
  const [circleHover, setCircleHover] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const assignees = (task.assignee_ids ?? []).map(byId).filter(Boolean) as import("@/types/task").Person[];
  const due = getDueLabel(task.due, locale);

  return (
    <>
      <div
        {...makeDragProps(task.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center gap-2 border-b border-border-faint rounded-md transition-colors cursor-grab active:cursor-grabbing"
        style={{
          padding: "8px 6px",
          marginLeft: -6,
          marginRight: -6,
          background: hovered ? "var(--bg-subtle)" : "transparent",
        }}
      >
        {/* Complete circle */}
        <button
          onMouseEnter={() => setCircleHover(true)}
          onMouseLeave={() => setCircleHover(false)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); complete(task.id); }}
          aria-label={t("row.complete")}
          className="flex-shrink-0 flex items-center justify-center w-[16px] h-[16px] rounded-full border-[1.5px] transition-all"
          style={{
            borderColor: circleHover ? "var(--accent-primary)" : "var(--border-strong)",
            background: circleHover ? "var(--accent-fog)" : "transparent",
            boxShadow: circleHover ? "0 0 6px var(--accent-glow)" : "none",
            color: "var(--accent-primary)",
            cursor: "default",
          }}
        >
          {circleHover && <IconCheck size={9} strokeWidth={2.5} />}
        </button>

        {/* Content area — click opens detail */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setDetailOpen(true)}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-text-primary truncate leading-snug">
              {ls(task.title)}
            </span>
            {task.week_focus && (
              <span
                className="flex-shrink-0 text-[11px]"
                style={{ color: "var(--accent-primary)" }}
                title={t("weekly.focus.badge")}
              >
                ★
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted tabular-nums">
            {due && <span>{due}</span>}
            {task.duration > 0 && <span>{fmtDuration(task.duration, locale)}</span>}
            <span className="pip">
              {Array.from({ length: task.pomos_total }).map((_, i) => (
                <i key={i} className={i < task.pomos_done ? "on" : ""} />
              ))}
            </span>
          </div>
        </div>

        {/* Hover actions */}
        <div
          className="flex items-center gap-1 transition-all"
          style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}
        >
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); navigate("/focus", { state: { taskId: task.id } }); }}
            title={t("row.startfocus")}
            aria-label={t("row.startfocus")}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              color: "var(--accent-primary)",
              background: "var(--accent-fog)",
              border: "1px solid var(--accent-edge)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--accent-fog)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-edge)";
            }}
          >
            <IconArrowRight size={11} />
            {t("row.startfocus")}
          </button>

          <button
            ref={moreRef}
            onMouseDown={(e) => e.stopPropagation()}
            title={t("matrix.moreActions")}
            aria-label={t("matrix.moreActions")}
            onClick={(e) => {
              e.stopPropagation();
              const rect = moreRef.current?.getBoundingClientRect();
              if (rect) setMoreAnchor(rect);
            }}
            className="flex items-center justify-center w-[24px] h-[22px] rounded-md transition-colors"
            style={{
              color: moreAnchor ? "var(--text-primary)" : "var(--text-secondary)",
              background: moreAnchor ? "var(--bg-elevated)" : "var(--bg-subtle)",
              border: `1px solid ${moreAnchor ? "var(--border-strong)" : "var(--border-default)"}`,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!moreAnchor) {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }
            }}
          >
            <IconMore size={12} />
          </button>
        </div>

        {/* Assignee avatars — stacked */}
        {assignees.length > 0 && (
          <div className="flex items-center" style={{ gap: 0 }}>
            {assignees.slice(0, 2).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i > 0 ? -5 : 0, zIndex: 2 - i, position: "relative" }}>
                <PersonAvatar person={p} size={18} />
              </div>
            ))}
            {assignees.length > 2 && (
              <div
                className="flex items-center justify-center rounded-full text-[9px] font-semibold"
                style={{ width: 18, height: 18, marginLeft: -5, background: "var(--bg-subtle)", border: "1px solid var(--border-default)", color: "var(--text-faint)", flexShrink: 0 }}
              >
                +{assignees.length - 2}
              </div>
            )}
          </div>
        )}
      </div>

      {moreAnchor && (
        <TaskMoreMenu
          anchor={moreAnchor}
          onClose={() => setMoreAnchor(null)}
          onEdit={() => setEditOpen(true)}
          onDelete={() => remove(task.id)}
        />
      )}
      {detailOpen && <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />}
      {editOpen && <TaskEditModal task={task} onClose={() => setEditOpen(false)} />}
    </>
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
      <span>{ls(task.title)}</span>
      {task.ai_suggest && <span className="chip chip-ai">AI → {task.ai_suggest}</span>}
    </div>
  );
}
