import { useT } from "@/i18n/useT";
import { useTaskDrop } from "@/lib/taskDnd";
import { TaskRow } from "@/components/TaskRow";
import type { Quadrant, Task } from "@/types/task";

/**
 * Kanban board of a single project's active tasks, grouped into Eisenhower
 * quadrant columns (#211 V2 ⭐4). Drag a card between columns to reassign its
 * quadrant — reusing the exact shared DnD primitives the Matrix uses, so both
 * stay behaviourally identical, and the same task card (TaskRow "card") so a
 * card opens, completes and offers the same actions as anywhere else. An "unclassified" column only appears when the
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
          tasks.map((task) => <TaskRow key={task.id} task={task} variant="card" />)
        )}
      </div>
    </div>
  );
}
