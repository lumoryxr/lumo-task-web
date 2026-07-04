import { useMemo, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { createPortal } from "react-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useTasksStore } from "@/store/useTasksStore";
import { usePetStore } from "@/store/usePetStore";
import { fmtDuration } from "@/lib/format";
import { getStagnantQ2Tasks } from "@/lib/stagnation";
import { useAppStore } from "@/store/useAppStore";
import type { CompletedEntry, Task } from "@/types/task";

type StepId = "results" | "unfinished" | "done";
type UnfinishedDecision = "keep" | "matrix" | "abandon";

// ─── Step: Results ────────────────────────────────────────────────────────────

interface ResultsStepProps {
  completed: CompletedEntry[];
  allTodayDone: boolean;
  totalFocusMin: number;
  totalPomos: number;
  stagnantQ2Count: number;
}

function ResultsStep({ completed, allTodayDone, totalFocusMin, totalPomos, stagnantQ2Count }: ResultsStepProps) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);

  const h = Math.floor(totalFocusMin / 60);
  const m = totalFocusMin % 60;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {allTodayDone ? t("review.step.results.alldone") : t("review.step.results.sub")}
      </p>

      {/* Stats row */}
      {(totalFocusMin > 0 || completed.length > 0) && (
        <div
          className="flex items-center gap-4 rounded-lg"
          style={{
            padding: "10px 14px",
            background: "linear-gradient(135deg, var(--accent-fog) 0%, var(--bg-deep) 80%)",
            border: "1px solid var(--accent-edge)",
          }}
        >
          {completed.length > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                {completed.length}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {locale === "zh" ? "任务" : "tasks"}
              </span>
            </div>
          )}
          {totalFocusMin > 0 && completed.length > 0 && (
            <div className="h-8 w-px" style={{ background: "var(--border-faint)" }} />
          )}
          {totalFocusMin > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                {h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {locale === "zh" ? "专注" : "focus"}
              </span>
            </div>
          )}
          {totalPomos > 0 && totalFocusMin > 0 && (
            <div className="h-8 w-px" style={{ background: "var(--border-faint)" }} />
          )}
          {totalPomos > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                {totalPomos}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                {locale === "zh" ? "番茄钟" : "pomos"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Completed task list */}
      {completed.length === 0 ? (
        <div
          className="text-sm text-center rounded-lg"
          style={{ padding: "24px 16px", color: "var(--text-faint)", background: "var(--bg-deep)" }}
        >
          {t("review.step.results.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {completed.map((entry) => {
            const durationLabel = fmtDuration(entry.duration, locale);
            const qColor = entry.quadrant === "Q1" ? "var(--q1-color)"
              : entry.quadrant === "Q2" ? "var(--q2-color)"
              : entry.quadrant === "Q3" ? "var(--q3-color)"
              : entry.quadrant === "Q4" ? "var(--q4-color)"
              : "var(--text-faint)";

            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-lg"
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border-faint)",
                }}
              >
                {/* Check icon */}
                <div
                  className="flex-shrink-0 rounded-full flex items-center justify-center"
                  style={{
                    width: 18, height: 18,
                    background: "var(--accent-dim)",
                    border: "1.5px solid var(--accent-primary)",
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12l5 5 11-11" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    <TaskTitle text={ls(entry.title)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.quadrant && entry.quadrant !== "unclassified" && (
                    <span className="text-[10px] font-semibold" style={{ color: qColor }}>
                      {entry.quadrant}
                    </span>
                  )}
                  {entry.duration > 0 && (
                    <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {durationLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Q2 stagnation nudge (#187) — gentle, not nagging */}
      {stagnantQ2Count >= 2 && (
        <div
          className="text-[13px] rounded-lg leading-relaxed"
          style={{
            padding: "10px 12px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border-faint)",
            color: "var(--text-secondary)",
          }}
        >
          🗂 {t("stagnation.review.summary").replace("{n}", String(stagnantQ2Count))}
        </div>
      )}
    </div>
  );
}

// ─── Step: Unfinished ────────────────────────────────────────────────────────

interface UnfinishedStepProps {
  unfinished: Task[];
  decisions: Map<string, UnfinishedDecision>;
  onDecide: (id: string, decision: UnfinishedDecision) => void;
  onKeepAll: () => void;
  abandoningId: string | null;
  onAbandonRequest: (id: string) => void;
  onAbandonConfirm: () => void;
  onAbandonCancel: () => void;
}

function UnfinishedStep({
  unfinished,
  decisions,
  onDecide,
  onKeepAll,
  abandoningId,
  onAbandonRequest,
  onAbandonConfirm,
  onAbandonCancel,
}: UnfinishedStepProps) {
  const t = useT();
  const ls = useLocaleString();

  if (unfinished.length === 0) {
    return (
      <div
        className="text-sm text-center rounded-lg"
        style={{ padding: "24px 16px", color: "var(--text-secondary)", background: "var(--bg-deep)" }}
      >
        {t("review.step.unfinished.alldone")}
      </div>
    );
  }

  const abandoningTask = abandoningId ? unfinished.find((tk) => tk.id === abandoningId) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("review.step.unfinished.sub")}
      </p>

      {/* Confirm abandon dialog */}
      {abandoningTask && (
        <div
          className="rounded-lg flex flex-col gap-3"
          style={{
            padding: "14px 16px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            {t("review.abandon.confirm").replace("{title}", ls(abandoningTask.title))}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onAbandonCancel}
              className="btn btn-ghost"
              style={{ minHeight: 36, fontSize: 13 }}
            >
              {t("review.abandon.cancel")}
            </button>
            <button
              onClick={onAbandonConfirm}
              style={{
                minHeight: 36, fontSize: 13, padding: "0 14px",
                borderRadius: "var(--radius-md)", border: "1px solid #ef4444",
                background: "rgba(239,68,68,0.08)", color: "#ef4444",
                cursor: "pointer", fontWeight: 500,
              }}
            >
              {t("review.abandon.yes")}
            </button>
          </div>
        </div>
      )}

      {/* Bulk action */}
      {!abandoningTask && (
        <button
          onClick={onKeepAll}
          className="text-sm"
          style={{
            padding: "7px 14px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-deep)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            alignSelf: "flex-start",
            transition: "all 0.15s",
          }}
        >
          {t("review.step.unfinished.keepall")}
        </button>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-2">
        {unfinished.map((task) => {
          const decision = decisions.get(task.id) ?? "keep";
          const isAbandoning = abandoningId === task.id;

          return (
            <div
              key={task.id}
              className="flex flex-col gap-2 rounded-lg"
              style={{
                padding: "10px 12px",
                background: isAbandoning ? "var(--bg-elevated)" : "var(--bg-deep)",
                border: "1px solid var(--border-faint)",
                opacity: abandoningId && !isAbandoning ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    <TaskTitle text={ls(task.title)} />
                  </div>
                  {task.quadrant !== "unclassified" && (
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {task.quadrant}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5 flex-shrink-0">
                  {(["keep", "matrix", "abandon"] as UnfinishedDecision[]).map((action) => {
                    const label = t(
                      action === "keep" ? "review.unfinished.keep"
                      : action === "matrix" ? "review.unfinished.matrix"
                      : "review.unfinished.abandon"
                    );
                    const isActive = decision === action;
                    const isRed = action === "abandon";

                    return (
                      <button
                        key={action}
                        onClick={() => {
                          if (action === "abandon" && !isActive) {
                            onAbandonRequest(task.id);
                          } else {
                            onDecide(task.id, action);
                          }
                        }}
                        disabled={!!abandoningId && abandoningId !== task.id}
                        className="text-xs rounded-md"
                        style={{
                          padding: "4px 9px",
                          minHeight: 32,
                          border: "1px solid",
                          borderColor: isActive
                            ? isRed ? "#ef4444" : "var(--accent-primary)"
                            : "var(--border-default)",
                          background: isActive
                            ? isRed ? "rgba(239,68,68,0.08)" : "var(--accent-dim)"
                            : "transparent",
                          color: isActive
                            ? isRed ? "#ef4444" : "var(--accent-primary)"
                            : "var(--text-secondary)",
                          cursor: "pointer",
                          fontWeight: isActive ? 600 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: Done ───────────────────────────────────────────────────────────────

interface DoneStepProps {
  completedCount: number;
  totalTodayCount: number;
  totalFocusMin: number;
}

function DoneStep({ completedCount, totalTodayCount, totalFocusMin }: DoneStepProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);

  const rate = totalTodayCount > 0 ? completedCount / totalTodayCount : completedCount > 0 ? 1 : 0;

  const summaryKey = rate >= 1 && completedCount > 0
    ? "review.step.done.perfect"
    : rate >= 0.5
    ? "review.step.done.great"
    : "review.step.done.ok";

  const h = Math.floor(totalFocusMin / 60);
  const m = totalFocusMin % 60;
  const focusLabel = totalFocusMin > 0
    ? h > 0
      ? t("review.step.done.focus").replace("{h}", String(h)).replace("{m}", String(m))
      : t("review.step.done.focus.min").replace("{m}", String(m))
    : null;

  return (
    <div className="flex flex-col items-center text-center gap-5">
      {/* Moon icon */}
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 64, height: 64,
          background: "linear-gradient(135deg, var(--accent-fog) 0%, var(--bg-deep) 80%)",
          border: "1px solid var(--accent-edge)",
          fontSize: 30,
        }}
      >
        🌙
      </div>

      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)", maxWidth: 320 }}>
        {t(summaryKey)}
      </p>

      {/* Stats */}
      {(completedCount > 0 || totalFocusMin > 0) && (
        <div className="flex items-center gap-6">
          {completedCount > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                {completedCount}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {locale === "zh" ? "任务" : "tasks"}
              </span>
            </div>
          )}
          {completedCount > 0 && focusLabel && (
            <div className="h-8 w-px" style={{ background: "var(--border-faint)" }} />
          )}
          {focusLabel && (
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent-primary)" }}>
                {h > 0 ? `${h}h` : `${m}m`}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {locale === "zh" ? "专注" : "focus"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface EveningReviewModalProps {
  onClose: () => void;
}

export function EveningReviewModal({ onClose }: EveningReviewModalProps) {
  const t = useT();
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const update = useTasksStore((s) => s.update);
  const remove = useTasksStore((s) => s.remove);

  // Unfinished today tasks
  const unfinished = useMemo(
    () => tasks.filter((tk) => tk.today && !tk.completed),
    [tasks]
  );

  // All today tasks count (for completion rate)
  const totalTodayCount = useMemo(
    () => unfinished.length + completed.length,
    [unfinished.length, completed.length]
  );

  // All today tasks done?
  const allTodayDone = unfinished.length === 0 && completed.length > 0;

  // Q2 tasks untouched ≥ 14 days — surfaces a gentle stagnation nudge (#187)
  const stagnantQ2Count = useMemo(() => getStagnantQ2Tasks(tasks).length, [tasks]);

  // Total focus minutes from completed entries
  const totalFocusMin = useMemo(
    () => completed.reduce((sum, e) => sum + (e.duration ?? 0), 0),
    [completed]
  );

  // Total pomos (1 pomo = 25 min, approximate)
  const totalPomos = useMemo(
    () => Math.floor(totalFocusMin / 25),
    [totalFocusMin]
  );

  // Steps — always show results and done; only show unfinished if there are any
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ["results"];
    if (unfinished.length > 0) s.push("unfinished");
    s.push("done");
    return s;
  }, [unfinished.length]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  // Decisions for unfinished tasks — default "keep"
  const [decisions, setDecisions] = useState<Map<string, UnfinishedDecision>>(
    () => new Map(unfinished.map((tk) => [tk.id, "keep"] as const))
  );

  // Abandon confirmation state
  const [abandoningId, setAbandoningId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  function handleDecide(id: string, decision: UnfinishedDecision) {
    setDecisions((prev) => new Map(prev).set(id, decision));
  }

  function handleKeepAll() {
    setDecisions(new Map(unfinished.map((tk) => [tk.id, "keep"] as const)));
  }

  function handleAbandonRequest(id: string) {
    setAbandoningId(id);
  }

  function handleAbandonConfirm() {
    if (abandoningId) {
      setDecisions((prev) => new Map(prev).set(abandoningId, "abandon"));
      setAbandoningId(null);
    }
  }

  function handleAbandonCancel() {
    setAbandoningId(null);
  }

  const isLastStep = step === "done";

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      // Apply decisions from unfinished step
      for (const [id, decision] of decisions) {
        if (decision === "matrix") {
          await update(id, { today: false });
        } else if (decision === "abandon") {
          await remove(id);
        }
        // "keep" means leave today: true — no action needed
      }
      localStorage.setItem("lumo.evening_review_done_date", new Date().toISOString().slice(0, 10));
      usePetStore.getState().celebrate("pet.celebrate.eveningdone");
      onClose();
    } catch {
      // A mutation failed — store already surfaces a toast. Leave modal open to retry.
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (isLastStep) {
      finish();
    } else {
      setStepIdx((s) => s + 1);
    }
  }

  function goBack() {
    if (stepIdx > 0) setStepIdx((s) => s - 1);
  }

  const stepLabel = t("review.progress")
    .replace("{step}", String(stepIdx + 1))
    .replace("{total}", String(steps.length));

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
      tabIndex={-1}
      aria-label={t("review.title")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 20px 14px",
            borderBottom: "1px solid var(--border-faint)",
            flexShrink: 0,
          }}
        >
          {/* Step progress dots */}
          <div className="flex items-center gap-1.5" style={{ flex: 1 }}>
            {steps.map((s, i) => (
              <div
                key={s}
                style={{
                  width: i === stepIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i <= stepIdx ? "var(--accent-primary)" : "var(--border-default)",
                  transition: "all 0.25s",
                }}
              />
            ))}
          </div>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: "var(--text-faint)", flexShrink: 0 }}
          >
            {stepLabel}
          </span>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-faint)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 4px 4px 8px",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Step title */}
        <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
          <h2
            className="font-semibold"
            style={{ fontSize: 17, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {step === "results" && t("review.step.results.title")}
            {step === "unfinished" && t("review.step.unfinished.title")}
            {step === "done" && t("review.step.done.title")}
          </h2>
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 0" }}>
          {step === "results" && (
            <ResultsStep
              completed={completed}
              allTodayDone={allTodayDone}
              totalFocusMin={totalFocusMin}
              totalPomos={totalPomos}
              stagnantQ2Count={stagnantQ2Count}
            />
          )}
          {step === "unfinished" && (
            <UnfinishedStep
              unfinished={unfinished}
              decisions={decisions}
              onDecide={handleDecide}
              onKeepAll={handleKeepAll}
              abandoningId={abandoningId}
              onAbandonRequest={handleAbandonRequest}
              onAbandonConfirm={handleAbandonConfirm}
              onAbandonCancel={handleAbandonCancel}
            />
          )}
          {step === "done" && (
            <DoneStep
              completedCount={completed.length}
              totalTodayCount={totalTodayCount}
              totalFocusMin={totalFocusMin}
            />
          )}
        </div>

        {/* Footer navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 20px",
            borderTop: "1px solid var(--border-faint)",
            flexShrink: 0,
          }}
        >
          {stepIdx > 0 && !isLastStep && (
            <button
              onClick={goBack}
              disabled={busy}
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
            >
              {t("review.btn.back")}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={goNext}
            disabled={busy || !!abandoningId}
            aria-busy={busy}
            className="btn btn-primary"
            style={{ minHeight: 44, minWidth: 100 }}
          >
            {busy ? <Spinner /> : isLastStep ? t("review.btn.finish") : t("review.btn.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
