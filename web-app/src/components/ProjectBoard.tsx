import { useState } from "react";
import { useTasksStore } from "@/store/useTasksStore";
import { useDragSettleStore } from "@/store/useDragSettleStore";
import { useT, useLocaleString } from "@/i18n/useT";
import { useTaskDrop, makeDragProps } from "@/lib/taskDnd";
import { IconCheck } from "@/components/icons";
import type { Quadrant, Task } from "@/types/task";

/**
 * Kanban board of a single project's active tasks, grouped into Eisenhower
 * quadrant columns (#211 V2 ⭐4). Drag a card between columns to reassign its
 * quadrant — reusing the exact shared DnD primitives the Matrix uses, so both
 * stay behaviourally identical. An "unclassified" column only appears when the
 * project actually has unclassified tasks, so the board isn't cluttered.
 */
const COLUMNS: Array<{ id: Quadrant; labelKey: string }> = [
  { id: "Q1", labelKey: "matrix.q1" },
  { id: "Q2", labelKey: "matrix.q2" },
  { id: "Q3", labelKey: "matrix.q3" },
  { id: "Q4", labelKey: "matrix.q4" },
];

export function ProjectBoard({ tasks }: { tasks: Task[] }) {
  const t = useT();
  const hasUnclassified = tasks.some((x) => x.quadrant === "unclassified");
  const columns = hasUnclassified
    ? [...COLUMNS, { id: "unclassified" as Quadrant, labelKey: "matrix.unclassified" }]
    : COLUMNS;

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((col) => (
        <BoardColumn
          key={col.id}
          quadrant={col.id}
          label={t(col.labelKey)}
          tasks={tasks.filter((x) => x.quadrant === col.id)}
        />
      ))}
    </div>
  );
}

function BoardColumn({ quadrant, label, tasks }: { quadrant: Quadrant; label: string; tasks: Task[] }) {
  const t = useT();
  const { over, handlers } = useTaskDrop(quadrant);
  return (
    <div
      {...handlers}
      className="flex flex-col min-h-[120px] rounded-lg border transition-all"
      style={{
        borderColor: over ? "var(--accent-edge)" : "var(--border-faint)",
        background: over ? "var(--accent-fog)" : "var(--bg-surface)",
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: "var(--border-faint)" }}>
        <span className={`qdot qdot-${quadrant.toLowerCase()}`} />
        <span className="text-[11px] font-semibold text-text-secondary truncate">{label}</span>
        <span className="ml-auto text-[10px] tabular-nums text-text-faint">{tasks.length}</span>
      </div>
      <div className="flex-1 flex flex-col gap-1.5 p-2">
        {tasks.length === 0 ? (
          <div className="text-[11px] text-text-faint italic px-1 py-2">
            {over ? t("matrix.dropHere") : "—"}
          </div>
        ) : (
          tasks.map((task) => <BoardCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}

function BoardCard({ task }: { task: Task }) {
  const t = useT();
  const ls = useLocaleString();
  const complete = useTasksStore((s) => s.complete);
  const settling = useDragSettleStore((s) => s.settleId === task.id);
  const [circleHover, setCircleHover] = useState(false);

  return (
    <div
      {...makeDragProps(task.id)}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-grab active:cursor-grabbing${settling ? " matrix-card-settle" : ""}`}
      style={{ borderColor: "var(--border-faint)", background: "var(--bg-elevated)" }}
    >
      <button
        onMouseEnter={() => setCircleHover(true)}
        onMouseLeave={() => setCircleHover(false)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); complete(task.id); }}
        aria-label={t("row.complete")}
        className="flex-shrink-0 flex items-center justify-center w-[15px] h-[15px] rounded-full border-[1.5px] transition-all"
        style={{
          borderColor: circleHover ? "var(--accent-primary)" : "var(--border-strong)",
          background: circleHover ? "var(--accent-fog)" : "transparent",
          color: "var(--accent-primary)",
        }}
      >
        {circleHover && <IconCheck size={9} strokeWidth={2.5} />}
      </button>
      <span className="text-[12px] text-text-primary truncate leading-snug">{ls(task.title)}</span>
    </div>
  );
}
