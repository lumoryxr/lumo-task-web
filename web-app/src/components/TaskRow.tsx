import { useRef, useState } from "react";
import type { Task } from "@/types/task";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "react-router-dom";
import { fmtDuration, getDueLabel, getDueColor } from "@/lib/format";
import { getStagnationTag, getStagnationLevel, getStagnationColor, getStagnationDays } from "@/lib/stagnation";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { TaskEditModal } from "@/components/TaskEditModal";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useTemplatesStore } from "@/store/useTemplatesStore";
import { PersonAvatar } from "@/components/PersonAvatar";
import { IconArrowRight, IconCheck, IconMore, IconRepeat } from "@/components/icons";
import { TaskMoreMenu } from "@/components/TaskMoreMenu";
import { TaskTitle } from "@/components/TaskTitle";

interface TaskRowProps {
  task: Task;
  compact?: boolean;
  /** Opt into multi-select: when the store's selectMode is on, the row becomes a checkbox toggle. */
  selectable?: boolean;
}

export function TaskRow({ task, compact = false, selectable = false }: TaskRowProps) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const navigate = useNavigate();
  const byId = usePeopleStore((s) => s.byId);
  const complete = useTasksStore((s) => s.complete);
  const remove = useTasksStore((s) => s.remove);
  const duplicate = useTasksStore((s) => s.duplicate);
  const saveAsTemplate = useTemplatesStore((s) => s.saveFromTask);
  // Subscribe to narrow booleans so only the rows whose state actually flips re-render.
  const selecting = useTasksStore((s) => s.selectMode) && selectable;
  const selected = useTasksStore((s) => s.selectedIds.includes(task.id)) && selecting;
  const toggleSelected = useTasksStore((s) => s.toggleSelected);

  const [hovered, setHovered] = useState(false);
  const [circleHover, setCircleHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const assignees = (task.assignee_ids ?? []).map(byId).filter(Boolean) as import("@/types/task").Person[];
  const q = task.quadrant === "unclassified" ? "un" : task.quadrant.toLowerCase();
  const due = getDueLabel(task.due, locale);
  const dueColor = getDueColor(task.due);
  const stagTag = getStagnationTag(task);
  const stagColor = getStagnationColor(getStagnationLevel(task));

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center gap-3 transition-all"
        style={{
          padding: compact ? "11px 14px" : "14px 16px",
          borderRadius: "var(--radius-lg)",
          background: selected ? "var(--accent-dim)" : "var(--bg-surface)",
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
        <span className={`qdot qdot-${q} flex-shrink-0`} />

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => (selecting ? toggleSelected(task.id) : setDetailOpen(true))}
        >
          <div className="text-sm font-medium text-text-primary truncate leading-snug">
            <TaskTitle text={ls(task.title)} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted tabular-nums">
            {due && <span style={{ color: dueColor }}>{due}</span>}
            {task.duration > 0 && <span>{fmtDuration(task.duration, locale)}</span>}
            <span className="pip">
              {Array.from({ length: task.pomos_total }).map((_, i) => (
                <i key={i} className={i < task.pomos_done ? "on" : ""} />
              ))}
            </span>
            {(task.subtasks?.length ?? 0) > 0 && (
              <span className="flex items-center gap-0.5" style={{ color: "var(--text-faint)" }}>
                <IconCheck size={9} strokeWidth={2} />
                {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
              </span>
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

        {/* ── Right: hover actions + meta (suppressed in select mode) ── */}
        <div
          className="flex items-center gap-1.5 transition-all"
          style={{
            opacity: hovered && !selecting ? 1 : 0,
            pointerEvents: hovered && !selecting ? "auto" : "none",
          }}
        >
          {/* Start focus — labeled accent pill */}
          <button
            onClick={(e) => { e.stopPropagation(); navigate("/focus", { state: { taskId: task.id } }); }}
            title={t("row.startfocus")}
            aria-label={t("row.startfocus")}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
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
            {t("row.startfocus")}
          </button>

          {/* ··· more menu — Edit + Delete */}
          <button
            ref={moreRef}
            title={t("matrix.moreActions")}
            aria-label={t("matrix.moreActions")}
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

        {/* Assignee avatars — stacked */}
        {assignees.length > 0 && (
          <div className="flex items-center" style={{ gap: 0 }}>
            {assignees.slice(0, 3).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i, position: "relative" }}>
                <PersonAvatar person={p} size={20} />
              </div>
            ))}
            {assignees.length > 3 && (
              <div
                className="flex items-center justify-center rounded-full text-[9px] font-semibold"
                style={{ width: 20, height: 20, marginLeft: -6, background: "var(--bg-subtle)", border: "1px solid var(--border-default)", color: "var(--text-faint)", flexShrink: 0 }}
              >
                +{assignees.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Quadrant chip — always visible */}
        {task.quadrant !== "unclassified" && (
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
          onSaveAsTemplate={() => saveAsTemplate(task)}
          onDelete={() => remove(task.id)}
        />
      )}

      {detailOpen && (
        <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />
      )}
      {editOpen && (
        <TaskEditModal task={task} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}
