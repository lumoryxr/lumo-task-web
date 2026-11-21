import { createPortal } from "react-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTasksStore } from "@/store/useTasksStore";
import { TaskProgressLog } from "@/components/TaskProgressLog";
import { IconClose } from "@/components/icons";
import type { Task } from "@/types/task";

interface TaskProgressDrawerProps {
  task: Task;
  onClose: () => void;
}

/**
 * Progress updates (进展记录) as their own panel: a drawer from the right
 * (full screen on phones) with the composer up top and every dated update
 * below. Opened from a task row or from the task's details, so logging
 * progress never crowds the details view.
 */
export function TaskProgressDrawer({ task, onClose }: TaskProgressDrawerProps) {
  const t = useT();
  const ls = useLocaleString();
  // Follow the live task so new updates show at once.
  const liveTask = useTasksStore((s) => (s.tasks ?? []).find((tk) => tk.id === task.id)) ?? task;
  const count = liveTask.progress_log?.length ?? 0;
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return createPortal(
    <div
      className="task-drawer-backdrop fade-in z-[250]"
      style={{ background: "rgba(8,11,10,0.45)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("progressLog.title")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="task-drawer"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lifted)" }}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border-faint">
          <div className="flex-1 min-w-0">
            <h2 id="task-progress-drawer-title" className="m-0 text-[15px] font-semibold text-text-primary">
              {t("progressLog.title")}
              {count > 0 && <span className="ml-2 text-[12px] font-normal tabular-nums text-text-faint">{count}</span>}
            </h2>
            <p className="m-0 mt-0.5 text-[12px] truncate text-text-muted">{ls(liveTask.title)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("qc.close")}
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-text-muted border border-border-default hover:bg-subtle hover:text-text-primary transition-colors"
          >
            <IconClose size={13} />
          </button>
        </header>
        <div className="task-dialog__body px-5 py-4">
          <TaskProgressLog task={liveTask} autoFocus />
        </div>
      </div>
    </div>,
    document.body,
  );
}
