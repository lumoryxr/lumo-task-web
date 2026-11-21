import { useRef, useState } from "react";
import type { Task } from "@/types/task";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "react-router-dom";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { fmtDuration, getDueLabel, getDueColor } from "@/lib/format";
import { getStagnationTag, getStagnationLevel, getStagnationColor, getStagnationDays } from "@/lib/stagnation";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskEditModal } from "@/components/TaskEditModal";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useTasksStore } from "@/store/useTasksStore";
import { AssigneeChip } from "@/components/AssigneeChip";
import { TaskProgressBar } from "@/components/TaskProgress";
import { StageTrack } from "@/components/StageTrack";
import { useProjectsStore } from "@/store/useProjectsStore";
import { IconArrowRight, IconCheck, IconMore, IconNote, IconRepeat } from "@/components/icons";
import { TaskProgressDrawer } from "@/components/TaskProgressDrawer";
import { TaskMoreMenu } from "@/components/TaskMoreMenu";
import { TaskTitle } from "@/components/TaskTitle";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useDragSettleStore } from "@/store/useDragSettleStore";
import { makeDragProps } from "@/lib/taskDnd";

interface TaskRowProps {
  task: Task;
  compact?: boolean;
  /** Opt into multi-select: when the store's selectMode is on, the row becomes a checkbox toggle. */
  selectable?: boolean;
  /**
   * "row" (default): a full-width list row (Today, project list).
   * "card": the denser card used inside the Matrix quadrants and the project
   * board — the column already says the quadrant, so the quadrant dot/chip are
   * dropped, the owner moves into the meta line and the actions float over the
   * card's right edge on hover instead of reserving width.
   */
  variant?: "row" | "card";
  /** Make the item draggable (onto a quadrant or a project group). Cards always are. */
  draggable?: boolean;
}

/**
 * The one task item used everywhere a task is listed — Today, the Matrix
 * quadrants, a project's list and its board — so a task looks and behaves the
 * same wherever it appears: same complete circle, same meta line, same actions
 * (Log progress, Start focus, ⋯ Edit / Duplicate / Delete), same detail dialog.
 */
export function TaskRow({ task, compact = false, selectable = false, variant = "row", draggable = false }: TaskRowProps) {
  const card = variant === "card";
  const canDrag = card || draggable;
  const settling = useDragSettleStore((s) => s.settleId === task.id);
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const navigate = useNavigate();
  const byId = usePeopleStore((s) => s.byId);
  const complete = useTasksStore((s) => s.complete);
  const remove = useTasksStore((s) => s.remove);
  const duplicate = useTasksStore((s) => s.duplicate);
  // Subscribe to narrow booleans so only the rows whose state actually flips re-render.
  const selecting = useTasksStore((s) => s.selectMode) && selectable;
  const selected = useTasksStore((s) => s.selectedIds.includes(task.id)) && selecting;
  const toggleSelected = useTasksStore((s) => s.toggleSelected);

  const [hovered, setHovered] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  // Latest progress update (by day, then time written), for the row's count badge.
  const progressLog = task.progress_log ?? [];
  const latestNote = progressLog.reduce<(typeof progressLog)[number] | null>(
    (best, n) => (!best || n.date > best.date || (n.date === best.date && n.created_at > best.created_at) ? n : best),
    null,
  );
  const coarse = useCoarsePointer();
  // Touch devices never hover, so keep the row actions reachable there.
  const showActions = (hovered || coarse) && !selecting;
  // A card's actions float over its right edge on hover. With touch (no hover)
  // they stay visible, so they sit inline instead of covering the title. On a
  // phone-width screen only ⋯ stays; Log progress and Start focus are one tap
  // away in the task dialog, so the title keeps the row's width.
  const overlayActions = card && !coarse;
  const [circleHover, setCircleHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const assignees = (task.assignee_ids ?? []).map(byId).filter(Boolean) as import("@/types/task").Person[];
  const projectStages = useProjectsStore((s) => s.projects.find((p) => p.id === task.project_id)?.stages);
  const q = task.quadrant === "unclassified" ? "un" : task.quadrant.toLowerCase();
  const due = getDueLabel(task.due, locale);
  const dueColor = getDueColor(task.due);
  const stagTag = getStagnationTag(task);
  const stagColor = getStagnationColor(getStagnationLevel(task));

  return (
    <>
      <div
        {...(canDrag && !selecting ? makeDragProps(task.id) : {})}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        data-variant={variant}
        className={`task-row relative flex items-center transition-all ${card ? "gap-2" : "gap-3"}${canDrag && !selecting ? " cursor-grab active:cursor-grabbing" : ""}${settling ? " matrix-card-settle" : ""}`}
        style={{
          padding: card ? "9px 10px" : compact ? "11px 14px" : "14px 16px",
          borderRadius: card ? "var(--radius-md)" : "var(--radius-lg)",
          background: selected ? "var(--accent-dim)" : card ? "var(--bg-elevated)" : "var(--bg-surface)",
          border: `1px solid ${selected ? "var(--accent-edge)" : hovered ? "var(--border-default)" : "var(--border-faint)"}`,
          boxShadow: hovered ? "var(--shadow-lifted)" : "var(--shadow-card)",
          transform: hovered ? "translateY(-1px)" : "none",
        }}
      >
        {/* ── Left: selection checkbox (select mode) or complete circle ── */}
        {selecting ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelected(task.id); }}
            role="checkbox"
            aria-checked={selected}
            aria-label={ls(task.title)}
            className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded transition-all"
            style={{
              border: `1.5px solid ${selected ? "var(--accent-primary)" : "var(--border-strong)"}`,
              background: selected ? "var(--accent-primary)" : "transparent",
              color: "var(--text-inverse)",
            }}
          >
            {selected && <IconCheck size={11} strokeWidth={2.5} />}
          </button>
        ) : (
        <button
          onMouseEnter={() => setCircleHover(true)}
          onMouseLeave={() => setCircleHover(false)}
          onClick={async (e) => {
            e.stopPropagation();
            if (busy || completing) return;
            // Show the filled-check pop, then let the row leave. The dwell that
            // keeps the confirmation visible is skipped under reduced motion
            // (in-product setting or OS preference) so it stays instant there.
            setCompleting(true);
            const reduce =
              useAppStore.getState().reducedMotion ||
              (typeof window !== "undefined" &&
                !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
            if (!reduce) await new Promise((r) => setTimeout(r, 240));
            setBusy(true);
            try {
              await complete(task.id);
            } finally {
              // Row usually unmounts on success; reset covers the failure path.
              setBusy(false);
              setCompleting(false);
            }
          }}
          disabled={busy}
          aria-label={t("row.complete")}
          className={`flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full border-[1.5px] transition-all${completing ? " task-complete-circle--done" : ""}`}
          style={{
            borderColor: circleHover || completing ? "var(--accent-primary)" : "var(--border-strong)",
            background: completing ? "var(--accent-primary)" : circleHover ? "var(--accent-fog)" : "transparent",
            boxShadow: circleHover || completing ? "0 0 6px var(--accent-glow)" : "none",
            color: completing ? "var(--text-inverse)" : "var(--accent-primary)",
          }}
        >
          {(circleHover || completing) && <IconCheck size={10} strokeWidth={2.5} />}
        </button>
        )}

        {/* ── Center: clickable content area ───────────────────── */}
        {!card && <span className={`qdot qdot-${q} flex-shrink-0`} />}

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => (selecting ? toggleSelected(task.id) : setDetailOpen(true))}
        >
          <div className={`flex items-center gap-1.5 font-medium text-text-primary leading-snug ${card ? "text-[13px]" : "text-sm"}`}>
            <span className="truncate"><TaskTitle text={ls(task.title)} /></span>
            {task.week_focus && (
              <span
                role="img"
                className="flex-shrink-0 text-[11px]"
                style={{ color: "var(--accent-primary)" }}
                title={t("weekly.focus.badge")}
                aria-label={t("weekly.focus.badge")}
              >
                ★
              </span>
            )}
          </div>
          <div className={`flex flex-wrap items-center gap-y-1 mt-0.5 text-text-muted tabular-nums ${card ? "gap-x-2 text-[11px]" : "gap-x-3 text-xs"}`}>
            {due && <span style={{ color: dueColor }}>{due}</span>}
            {task.duration > 0 && <span>{fmtDuration(task.duration, locale)}</span>}
            <span className="pip">
              {Array.from({ length: task.pomos_total }).map((_, i) => (
                <i key={i} className={i < task.pomos_done ? "on" : ""} />
              ))}
            </span>
            {task.stage_id && projectStages && projectStages.length > 0 && (
              <StageTrack variant="compact" stages={projectStages} currentId={task.stage_id} />
            )}
            {(task.progress ?? 0) > 0 && <TaskProgressBar value={task.progress} />}
            {(task.subtasks?.length ?? 0) > 0 && (
              <span className="flex items-center gap-0.5" style={{ color: "var(--text-faint)" }}>
                <IconCheck size={9} strokeWidth={2} />
                {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
              </span>
            )}
            {latestNote && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setProgressOpen(true); }}
                aria-label={t("progressLog.openCount").replace("{n}", String(progressLog.length))}
                title={`${t("progressLog.latest")} · ${latestNote.date}：${latestNote.text}`}
                className="flex items-center gap-0.5 rounded px-1 -mx-1 hover:text-text-primary hover:bg-subtle transition-colors"
                style={{ color: "var(--text-faint)" }}
              >
                <IconNote size={11} />
                {progressLog.length}
              </button>
            )}
            {task.recurrence && task.recurrence !== "none" && (
              <span
                role="img"
                className="flex items-center"
                style={{ color: "var(--text-faint)" }}
                title={t(`task.recurrence.${task.recurrence}`)}
                aria-label={t(`task.recurrence.${task.recurrence}`)}
              >
                <IconRepeat size={10} strokeWidth={1.75} />
              </span>
            )}
            {stagTag && (
              <span
                className="flex-shrink-0 font-medium"
                style={{ color: stagColor }}
                title={t("stagnation.untouched").replace("{n}", String(getStagnationDays(task.updated_at)))}
                aria-label={t("stagnation.untouched").replace("{n}", String(getStagnationDays(task.updated_at)))}
              >
                {stagTag}
              </span>
            )}
            <AssigneeChip
              people={assignees}
              size={14}
              variant="inline"
              nameMaxWidthClass={card ? "max-w-[120px]" : "max-w-[160px]"}
              className={card ? undefined : "sm:hidden"}
            />
            {(task.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="flex-shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium leading-none"
                style={{
                  color: "var(--accent-primary)",
                  background: "var(--accent-fog)",
                  border: "1px solid var(--accent-edge)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── Right: hover actions + meta (suppressed in select mode) ──
            On a card they float over the right edge so a narrow column keeps
            the whole width for the title until the card is hovered. */}
        <div
          className={`flex items-center transition-all ${overlayActions ? "absolute right-2 top-1/2 -translate-y-1/2 gap-1 rounded-md pl-2" : card ? "gap-1" : "gap-1.5"}`}
          style={{
            opacity: showActions ? 1 : 0,
            pointerEvents: showActions ? "auto" : "none",
            background: overlayActions ? "var(--bg-subtle)" : undefined,
          }}
        >
          {/* Log progress — opens the progress panel without opening the task */}
          <button
            onClick={(e) => { e.stopPropagation(); setProgressOpen(true); }}
            title={t("progressLog.addShort")}
            aria-label={t("progressLog.addShort")}
            className={`hidden sm:flex items-center gap-1 rounded-md py-1 text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors ${card ? "px-1.5" : "px-2"}`}
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)" }}
          >
            <IconNote size={12} />
            {!card && <span className="hidden md:inline">{t("progressLog.addShort")}</span>}
          </button>

          {/* Start focus — labeled accent pill */}
          <button
            onClick={(e) => { e.stopPropagation(); navigate("/focus", { state: { taskId: task.id } }); }}
            title={t("row.startfocus")}
            aria-label={t("row.startfocus")}
            className={`hidden sm:flex items-center gap-1.5 rounded-md py-1 text-[12px] font-medium transition-colors ${card ? "px-1.5" : "px-2.5"}`}
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
            <IconArrowRight size={12} />
            {!card && t("row.startfocus")}
          </button>

          {/* ··· more menu — Edit + Delete */}
          <button
            ref={moreRef}
            title={t("matrix.moreActions")}
            aria-label={t("matrix.moreActions")}
            aria-haspopup="menu"
            aria-expanded={moreAnchor !== null}
            onClick={(e) => {
              e.stopPropagation();
              const rect = moreRef.current?.getBoundingClientRect();
              if (rect) setMoreAnchor(rect);
            }}
            className="flex items-center justify-center w-[28px] h-[26px] rounded-md transition-colors"
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
            <IconMore size={13} />
          </button>
        </div>

        {/* Assignees — avatar + name so ownership reads at a glance; truncates to keep the row stable.
            On narrow screens it moves into the meta line instead (see above) so the title keeps its width. */}
        {!card && (
          <AssigneeChip
            people={assignees}
            size={18}
            className="hidden sm:flex"
          />
        )}

        {/* Quadrant chip — always visible on a row (a card's column already says it) */}
        {!card && task.quadrant !== "unclassified" && (
          <span
            className={`chip chip-${task.quadrant.toLowerCase()} flex-shrink-0`}
            onClick={() => setDetailOpen(true)}
            style={{ cursor: "pointer" }}
          >
            {task.quadrant}
          </span>
        )}
      </div>

      {moreAnchor && (
        <TaskMoreMenu
          anchor={moreAnchor}
          onClose={() => setMoreAnchor(null)}
          onEdit={() => setEditOpen(true)}
          onDuplicate={() => duplicate(task.id)}
          onDelete={() => setConfirmDelete(true)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t("task.delete.confirm.title")}
        message={t("task.delete.confirm")}
        detail={ls(task.title)}
        confirmLabel={t("popover.delete")}
        onConfirm={() => { setConfirmDelete(false); void remove(task.id).catch(() => {}); }}
        onCancel={() => setConfirmDelete(false)}
      />

      {detailOpen && (
        <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />
      )}
      {progressOpen && (
        <TaskProgressDrawer task={task} onClose={() => setProgressOpen(false)} />
      )}
      {editOpen && (
        <TaskEditModal task={task} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}
