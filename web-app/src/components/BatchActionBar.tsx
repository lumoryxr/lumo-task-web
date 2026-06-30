import { useState } from "react";
import { useT } from "@/i18n/useT";
import { useTasksStore } from "@/store/useTasksStore";
import type { Task } from "@/types/task";
import { IconCheck } from "@/components/icons";

const QUADRANTS: Task["quadrant"][] = ["Q1", "Q2", "Q3", "Q4", "unclassified"];

/**
 * Floating action bar for multi-select. Renders only while the tasks store is in
 * select mode; operates on the current selection via the store's batch methods.
 * `candidateIds` are the ids currently visible to the user (drives "select all").
 */
export function BatchActionBar({ candidateIds }: { candidateIds: string[] }) {
  const t = useT();
  const selectMode = useTasksStore((s) => s.selectMode);
  const selectedIds = useTasksStore((s) => s.selectedIds);
  const setSelection = useTasksStore((s) => s.setSelection);
  const clearSelection = useTasksStore((s) => s.clearSelection);
  const setSelectMode = useTasksStore((s) => s.setSelectMode);
  const completeBatch = useTasksStore((s) => s.completeBatch);
  const removeBatch = useTasksStore((s) => s.removeBatch);
  const moveBatch = useTasksStore((s) => s.moveBatch);

  const [busy, setBusy] = useState(false);
  const [showMove, setShowMove] = useState(false);

  if (!selectMode) return null;

  const count = selectedIds.length;
  const allSelected = candidateIds.length > 0 && candidateIds.every((id) => selectedIds.includes(id));

  // Run a batch op, then drop the (now-consumed) selection but stay in select
  // mode so the user can keep acting. Guards against double-fire while in flight.
  async function run(op: () => Promise<unknown>) {
    if (busy || count === 0) return;
    setBusy(true);
    setShowMove(false);
    try {
      await op();
      clearSelection();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t("batch.count").replace("{n}", String(count))}
      className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg"
      style={{
        bottom: "calc(20px + env(safe-area-inset-bottom))",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <span className="text-sm font-medium text-text-primary tabular-nums px-1">
        {t("batch.count").replace("{n}", String(count))}
      </span>

      <button
        onClick={() => (allSelected ? clearSelection() : setSelection(candidateIds))}
        disabled={busy || candidateIds.length === 0}
        className="text-xs px-2 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
      >
        {allSelected ? t("batch.clear") : t("batch.selectAll")}
      </button>

      <div className="w-px h-5" style={{ background: "var(--border-default)" }} />

      <button
        onClick={() => run(() => completeBatch(selectedIds))}
        disabled={busy || count === 0}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
        style={{ color: "var(--accent-primary)", background: "var(--accent-fog)", border: "1px solid var(--accent-edge)", opacity: count === 0 ? 0.5 : 1 }}
      >
        <IconCheck size={12} strokeWidth={2.5} />
        {t("batch.complete")}
      </button>

      <div className="relative">
        <button
          onClick={() => setShowMove((v) => !v)}
          disabled={busy || count === 0}
          aria-haspopup="menu"
          aria-expanded={showMove}
          className="text-xs font-medium px-2.5 py-1 rounded-md text-text-primary transition-colors"
          style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", opacity: count === 0 ? 0.5 : 1 }}
        >
          {t("batch.move")}
        </button>
        {showMove && (
          <div
            role="menu"
            aria-label={t("batch.move.title")}
            className="absolute bottom-full mb-1 left-0 flex flex-col rounded-lg py-1 shadow-lg"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", minWidth: 120 }}
          >
            {QUADRANTS.map((q) => (
              <button
                key={q}
                role="menuitem"
                onClick={() => run(() => moveBatch(selectedIds, q))}
                className="text-left text-xs px-3 py-1.5 text-text-primary hover:bg-bg-subtle transition-colors"
              >
                {q === "unclassified" ? t("matrix.unclassified") : q}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => {
          if (busy || count === 0) return;
          if (!window.confirm(t("batch.deleteConfirm").replace("{n}", String(count)))) return;
          run(() => removeBatch(selectedIds));
        }}
        disabled={busy || count === 0}
        className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
        style={{ color: "#e05252", background: "transparent", border: "1px solid var(--border-default)", opacity: count === 0 ? 0.5 : 1 }}
      >
        {t("batch.delete")}
      </button>

      <div className="w-px h-5" style={{ background: "var(--border-default)" }} />

      <button
        onClick={() => setSelectMode(false)}
        disabled={busy}
        className="text-xs font-medium px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
      >
        {t("batch.done")}
      </button>
    </div>
  );
}
