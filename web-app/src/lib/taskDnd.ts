import { useState } from "react";
import { useTasksStore } from "@/store/useTasksStore";
import { useDragSettleStore } from "@/store/useDragSettleStore";
import type { Quadrant, Task } from "@/types/task";

/**
 * Shared task drag-and-drop primitives (#211 V2 ⭐4).
 *
 * Extracted from MatrixPage so the project board can reuse the exact same
 * "drag a task card onto a quadrant to reassign it" behaviour. A dropped task's
 * quadrant is updated through the tasks store and flagged for a short settle
 * animation in its new column.
 */
export const DND_MIME = "application/x-lumo-task";

export function useTaskDrop(target: Quadrant | "unclassified") {
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
        // Flag the moved card so it plays a short settle in its new quadrant.
        useDragSettleStore.getState().settle(id);
      },
    },
  };
}

export function makeDragProps(taskId: string) {
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
