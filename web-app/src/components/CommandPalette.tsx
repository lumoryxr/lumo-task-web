import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTasksStore } from "@/store/useTasksStore";
import { useAppStore } from "@/store/useAppStore";
import { useT } from "@/i18n/useT";
import { TaskEditModal } from "@/components/TaskEditModal";
import { QuickCreate } from "@/components/QuickCreate";
import { useModalA11y } from "@/hooks/useModalA11y";
import type { Subtask, Task } from "@/types/task";

const Q_CHIP_CLASS: Record<string, string> = {
  Q1: "chip chip-q1",
  Q2: "chip chip-q2",
  Q3: "chip chip-q3",
  Q4: "chip chip-q4",
};

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const tasks = useTasksStore((s) => s.tasks);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [createWithTitle, setCreateWithTitle] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when the palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setShowCompleted(false);
      setEditTask(null);
      setCreateWithTitle(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 150ms debounce on query
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const results = useMemo(() => {
    const pool = showCompleted ? tasks : tasks.filter((task) => !task.completed);

    if (!debouncedQuery.trim()) {
      // Empty state: prefer today tasks, fall back to Q1
      const todayTasks = pool.filter((task) => task.today);
      if (todayTasks.length > 0) return todayTasks.slice(0, 5);
      return pool.filter((task) => task.quadrant === "Q1").slice(0, 5);
    }

    const q = debouncedQuery.toLowerCase();
    return pool
      .filter((task) => {
        const primary = locale === "zh" ? (task.title.zh ?? task.title.en) : task.title.en;
        const fallback = locale === "zh" ? task.title.en : (task.title.zh ?? "");
        const desc = task.desc
          ? locale === "zh"
            ? (task.desc.zh ?? task.desc.en)
            : task.desc.en
          : "";
        const subtaskMatch = task.subtasks?.some((s: Subtask) =>
          s.title.toLowerCase().includes(q),
        );
        return (
          primary.toLowerCase().includes(q) ||
          fallback.toLowerCase().includes(q) ||
          desc.toLowerCase().includes(q) ||
          subtaskMatch
        );
      })
      .slice(0, 20);
  }, [tasks, debouncedQuery, locale, showCompleted]);

  const selectTask = useCallback((task: Task) => {
    setEditTask(task);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) selectTask(results[selectedIndex]);
          break;
      }
    },
    [results, selectedIndex, selectTask],
  );

  // Inactive while a nested modal (edit / quick-create) is open or the palette is closed.
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, open && !editTask && !createWithTitle);

  if (editTask) {
    return (
      <TaskEditModal
        task={editTask}
        onClose={() => {
          setEditTask(null);
          onClose();
        }}
      />
    );
  }

  if (createWithTitle !== null) {
    return (
      <QuickCreate
        initialTitle={createWithTitle}
        onClose={() => {
          setCreateWithTitle(null);
          onClose();
        }}
        onCreated={() => {
          setCreateWithTitle(null);
          onClose();
        }}
      />
    );
  }

  if (!open) return null;

  const hasQuery = debouncedQuery.trim().length > 0;
  const noResults = hasQuery && results.length === 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("search.placeholder")}
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ paddingTop: "15vh", background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full mx-4 bg-surface border border-border-default rounded-xl overflow-hidden"
        style={{ maxWidth: 560, boxShadow: "var(--shadow-window)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search input ── */}
        <div
          className="flex items-center gap-3 px-4 border-b border-border-faint"
          style={{ height: 52 }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="flex-shrink-0 text-text-faint"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-text-primary placeholder:text-text-faint"
          />
          {/* Show completed toggle */}
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex-shrink-0 flex items-center gap-1 text-[11px] rounded px-2 py-1 transition-colors"
            style={{
              color: showCompleted ? "var(--accent-primary)" : "var(--text-faint)",
              background: showCompleted ? "var(--accent-fog)" : "transparent",
              border: `1px solid ${showCompleted ? "var(--accent-edge)" : "var(--border-faint)"}`,
            }}
            aria-pressed={showCompleted}
          >
            {t("search.showCompleted")}
          </button>
          <kbd
            className="flex-shrink-0 text-[10px] font-mono text-text-faint border border-border-default rounded bg-deep"
            style={{ padding: "1px 5px" }}
          >
            esc
          </kbd>
        </div>

        {/* ── Results list ── */}
        <div className="py-1.5" style={{ maxHeight: 400, overflowY: "auto" }}>
          {noResults ? (
            <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
              <span className="text-sm text-text-faint">{t("search.noResults")}</span>
              <button
                onClick={() => setCreateWithTitle(debouncedQuery.trim())}
                className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  color: "var(--accent-primary)",
                  background: "var(--accent-fog)",
                  border: "1px solid var(--accent-edge)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t("search.createWithQuery")} "{debouncedQuery}"
              </button>
            </div>
          ) : (
            <>
              {!hasQuery && (
                <div className="px-4 py-1 text-[11px] font-medium text-text-faint uppercase tracking-wider">
                  {t("search.quickAccess")}
                </div>
              )}
              {results.map((task, i) => {
                const title =
                  locale === "zh" ? (task.title.zh ?? task.title.en) : task.title.en;
                const isActive = i === selectedIndex;
                const chipClass = Q_CHIP_CLASS[task.quadrant] ?? "chip";

                return (
                  <button
                    key={task.id}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => selectTask(task)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? "bg-subtle" : ""
                    }`}
                  >
                    <span className={chipClass} style={{ flexShrink: 0 }}>
                      {task.quadrant === "unclassified" ? "—" : task.quadrant}
                    </span>

                    <span
                      className="flex-1 min-w-0 text-[13px] truncate"
                      style={{
                        color: task.completed ? "var(--text-faint)" : "var(--text-primary)",
                        textDecoration: task.completed ? "line-through" : "none",
                      }}
                    >
                      <HighlightedText text={title} query={debouncedQuery} />
                    </span>

                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      {task.today && !task.completed && (
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            color: "var(--accent-primary)",
                            background: "var(--accent-fog)",
                            border: "1px solid var(--accent-edge)",
                          }}
                        >
                          {t("search.today")}
                        </span>
                      )}
                      {task.due && (
                        <span className="text-[11px] text-text-faint">{task.due}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* ── Footer hints ── */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border-faint text-[11px] text-text-faint">
          <span>
            <kbd className="font-mono">↑↓</kbd> {t("search.hint.navigate")}
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> {t("search.hint.open")}
          </span>
          <span>
            <kbd className="font-mono">esc</kbd> {t("search.hint.close")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
