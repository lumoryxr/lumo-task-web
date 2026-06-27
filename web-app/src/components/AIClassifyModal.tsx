import { useEffect, useMemo, useRef, useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { IconClose, IconSparkle } from "@/components/icons";
import { useT, useLocaleString } from "@/i18n/useT";
import { useTasksStore } from "@/store/useTasksStore";
import type { Quadrant, Task } from "@/types/task";

interface AIClassifyModalProps {
  onClose: () => void;
}

const QUADRANTS: Quadrant[] = ["Q1", "Q2", "Q3", "Q4"];

/**
 * AI classify — calls the backend classify endpoint on mount to get
 * LLM-powered (or heuristic) quadrant suggestions for all active tasks.
 * Each suggestion shows a one-line reason. Users can override any quadrant
 * before applying all changes at once.
 */
export function AIClassifyModal({ onClose }: AIClassifyModalProps) {
  const t = useT();
  const ls = useLocaleString();
  const tasks = useTasksStore((s) => s.tasks);
  const update = useTasksStore((s) => s.update);
  const classifyTasks = useTasksStore((s) => s.classifyTasks);

  // All non-completed tasks — unclassified first, then by quadrant
  const candidates = useMemo(() => {
    const active = tasks.filter((x) => !x.completed);
    return [
      ...active.filter((x) => x.quadrant === "unclassified"),
      ...active.filter((x) => x.quadrant !== "unclassified"),
    ];
  }, [tasks]);

  const unclassifiedCount = candidates.filter((t) => t.quadrant === "unclassified").length;

  // Local override map: taskId → chosen quadrant
  const [assign, setAssign] = useState<Record<string, Quadrant>>(() => {
    const m: Record<string, Quadrant> = {};
    candidates.forEach((task) => {
      m[task.id] = task.quadrant === "unclassified"
        ? (task.ai_suggest ?? "Q2")
        : task.quadrant;
    });
    return m;
  });

  // AI-provided reasons: taskId → reason string
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [isClassifying, setIsClassifying] = useState(unclassifiedCount > 0);
  const [busy, setBusy] = useState(false);

  // Call classify API once on mount if there are unclassified tasks.
  // Using a ref guard so candidates changes (during LLM streaming) don't re-trigger.
  const classifyCalledRef = useRef(false);
  useEffect(() => {
    if (classifyCalledRef.current || unclassifiedCount === 0) return;
    classifyCalledRef.current = true;
    setIsClassifying(true);

    classifyTasks()
      .then((suggestions) => {
        setAssign((prev) => {
          const next = { ...prev };
          for (const s of suggestions) {
            if (QUADRANTS.includes(s.quadrant as Quadrant)) {
              next[s.task_id] = s.quadrant as Quadrant;
            }
          }
          return next;
        });
        const r: Record<string, string> = {};
        for (const s of suggestions) {
          if (s.reason) r[s.task_id] = s.reason;
        }
        setReasons(r);
      })
      .catch(() => {
        // Classify failed — keep existing ai_suggest values, no reasons shown
      })
      .finally(() => setIsClassifying(false));
  }, [unclassifiedCount]);

  // Esc/focus-trap/focus-return via the shared hook; keep the busy guard so a
  // classify in flight isn't interrupted by Escape.
  const dialogRef = useModalA11y<HTMLDivElement>(() => { if (!busy) onClose(); });

  const counts = QUADRANTS.reduce<Record<Quadrant, number>>(
    (acc, q) => {
      acc[q] = Object.values(assign).filter((x) => x === q).length;
      return acc;
    },
    { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unclassified: 0 }
  );

  const changedCount = candidates.filter(
    (task) => assign[task.id] && assign[task.id] !== task.quadrant
  ).length;

  async function applyAll() {
    setBusy(true);
    try {
      const changed = candidates.filter(
        (task) => assign[task.id] && assign[task.id] !== task.quadrant
      );
      await Promise.all(changed.map((task) => update(task.id, { quadrant: assign[task.id] })));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fade-in absolute inset-0 z-[120] flex items-center justify-center"
      style={{
        background: "rgba(8, 11, 10, 0.65)",
        backdropFilter: "blur(6px)",
        padding: 32,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col w-full overflow-hidden border rounded-[14px] bg-elevated shadow-lifted"
        style={{
          maxWidth: 600,
          maxHeight: "100%",
          borderColor: "var(--accent-edge)",
          boxShadow: "var(--shadow-lifted), 0 0 50px var(--accent-fog)",
        }}
      >
        {/* Header */}
        <header className="flex items-start gap-3 px-[18px] py-4 border-b border-border-faint">
          <span className="lumo-glyph" style={{ width: 16, height: 16, marginTop: 1 }}>
            <span className="halo" />
            <span className="core" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-text-primary flex items-center gap-2">
              {t("matrix.aiClassify.title")}
              <span className="text-[11px] font-normal text-text-faint tabular-nums">
                {candidates.length} {t("matrix.aiClassify.tasks")}
                {unclassifiedCount > 0 && (
                  <span className="ml-1.5 text-text-muted">
                    · {unclassifiedCount} {t("matrix.aiClassify.unclassified")}
                  </span>
                )}
              </span>
              {isClassifying && (
                <span
                  className="text-[11px] font-normal ml-1 tabular-nums"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {t("matrix.aiClassify.pending")}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-text-muted leading-relaxed">
              {t("matrix.aiClassify.sub")}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            title={t("qc.close")}
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <IconClose size={12} />
          </button>
        </header>

        {/* Summary bar */}
        <div
          className="flex gap-3.5 px-[18px] py-2.5 border-b border-border-faint text-[11px] text-text-muted tabular-nums"
          style={{ background: "var(--bg-surface)" }}
        >
          {QUADRANTS.map((q) => (
            <span key={q} className="flex items-center gap-1.5">
              <span className={`qdot qdot-${q.toLowerCase()}`} />
              {q} · {counts[q as Quadrant]}
            </span>
          ))}
          {changedCount > 0 && (
            <span className="ml-auto" style={{ color: "var(--accent-primary)" }}>
              {changedCount} {t("matrix.aiClassify.changed")}
            </span>
          )}
        </div>

        {/* Task list */}
        <div className="flex-1 min-h-0 scroll-y px-[18px] py-3 flex flex-col gap-1.5">
          {candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              {t("matrix.aiClassify.empty")}
            </div>
          ) : (
            candidates.map((task) => (
              <Row
                key={task.id}
                task={task}
                value={assign[task.id]}
                reason={reasons[task.id]}
                isClassifying={isClassifying && task.quadrant === "unclassified"}
                onChange={(q) => setAssign((m) => ({ ...m, [task.id]: q }))}
                titleStr={ls(task.title)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 px-[18px] py-3 border-t border-border-faint">
          <div className="text-[11px] text-text-faint flex items-center gap-1.5">
            <IconSparkle size={12} />
            {unclassifiedCount > 0
              ? t("matrix.aiClassify.hint.ai")
              : t("matrix.aiClassify.hint.manual")}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {t("qc.cancel")}
            </button>
            <button
              className="btn btn-primary"
              onClick={applyAll}
              disabled={busy || changedCount === 0}
            >
              {t("matrix.aiClassify.apply")}
              {changedCount > 0 && <span className="ml-1">· {changedCount}</span>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Row({
  task,
  value,
  reason,
  isClassifying,
  onChange,
  titleStr,
}: {
  task: Task;
  value: Quadrant;
  reason?: string;
  isClassifying: boolean;
  onChange: (q: Quadrant) => void;
  titleStr: string;
}) {
  const t = useT();
  const isUnclassified = task.quadrant === "unclassified";

  let hint: string;
  if (isClassifying) {
    hint = "…";
  } else if (reason) {
    hint = reason;
  } else if (isUnclassified) {
    hint = task.ai_suggest
      ? `${t("matrix.aiClassify.suggests")} ${task.ai_suggest}`
      : t("matrix.aiClassify.nosuggestion");
  } else {
    hint = `${t("matrix.aiClassify.current")} ${task.quadrant}`;
  }

  return (
    <div
      className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-surface"
      style={{ border: "1px solid var(--border-faint)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {!isUnclassified && (
            <span className={`chip chip-${task.quadrant.toLowerCase()} flex-shrink-0`}>
              {task.quadrant}
            </span>
          )}
          <div className="text-[13px] text-text-primary truncate">{titleStr}</div>
        </div>
        <div
          className="text-[10.5px] mt-0.5 leading-snug"
          style={{
            color: reason ? "var(--text-secondary)" : "var(--text-faint)",
            fontStyle: reason ? "normal" : "italic",
          }}
        >
          {hint}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {QUADRANTS.map((q) => {
          const on = value === q;
          return (
            <button
              key={q}
              onClick={() => onChange(q)}
              title={q}
              className="flex items-center justify-center rounded transition-all"
              style={{
                width: 28,
                height: 26,
                border: on ? "1px solid var(--accent-edge)" : "1px solid var(--border-default)",
                background: on ? "var(--accent-fog)" : "var(--bg-surface)",
                color: on ? "var(--accent-primary)" : "var(--text-secondary)",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "inherit",
                gap: 4,
              }}
            >
              <span className={`qdot qdot-${q.toLowerCase()}`} />
              {q}
            </button>
          );
        })}
      </div>
    </div>
  );
}
