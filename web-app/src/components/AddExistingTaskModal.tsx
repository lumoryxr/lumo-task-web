import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";
import { IconClose, IconPlus } from "@/components/icons";
import { useT, pickLocale } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { TaskTitle } from "@/components/TaskTitle";
import { Spinner } from "@/components/Spinner";

interface AddExistingTaskModalProps {
  /** The project the picked tasks get assigned to. */
  projectId: string;
  onClose: () => void;
}

/**
 * Pick already-existing tasks and assign them to a project, instead of only
 * creating brand-new ones. Assigning a task is just setting its `project_id`
 * (tasks are single-project, 2A), so this is pure client wiring over the
 * existing task-update API — no new endpoint/contract.
 */
export function AddExistingTaskModal({ projectId, onClose }: AddExistingTaskModalProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const tasks = useTasksStore((s) => s.tasks);
  const updateTask = useTasksStore((s) => s.update);
  const projects = useProjectsStore((s) => s.projects);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Candidates: active tasks not already in this project. Assigning one removes
  // it from this list on the next store render (it now matches project_id).
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((tk) => !tk.completed && tk.project_id !== projectId)
      .filter((tk) => !q || pickLocale(tk.title, locale).toLowerCase().includes(q));
  }, [tasks, projectId, query, locale]);

  const projectName = (pid: string | null | undefined): string => {
    const p = pid ? projects.find((pr) => pr.id === pid) : undefined;
    return p?.name ?? t("project.tasks.unassigned");
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("project.tasks.addExisting.title")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 460, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border-faint)",
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {t("project.tasks.addExisting.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("qc.close")}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            className="input w-full text-sm"
          />
        </div>

        {/* Candidate list */}
        <div style={{ padding: "12px 20px 20px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          {candidates.length === 0 ? (
            <p className="text-xs text-text-faint py-4 text-center">{t("project.tasks.addExisting.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((tk) => (
                <li key={tk.id}>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-busy={busyId === tk.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(tk.id);
                      try { await updateTask(tk.id, { project_id: projectId }); }
                      catch { /* store surfaces its own error toast */ }
                      finally { setBusyId(null); }
                    }}
                    aria-label={`${t("project.tasks.addExisting")}: ${pickLocale(tk.title, locale)}`}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-subtle transition-colors disabled:opacity-60"
                  >
                    <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
                      <TaskTitle text={pickLocale(tk.title, locale)} />
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-text-faint truncate max-w-[120px]">
                      {projectName(tk.project_id)}
                    </span>
                    {busyId === tk.id ? <Spinner size={14} /> : <IconPlus size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
