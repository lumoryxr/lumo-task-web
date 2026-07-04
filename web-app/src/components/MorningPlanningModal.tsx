import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { createPortal } from "react-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePetStore } from "@/store/usePetStore";
import { useAIStore } from "@/store/useAIStore";
import { PetSvg } from "@/components/PetSvg";
import type { PetSpecies } from "@/components/PetSvg";
import { toISODate } from "@/lib/format";
import type { Task } from "@/types/task";

const MAX_TODAY = 3;

type StepId = "carry" | "select" | "ai" | "done";

const QUOTES_EN = [
  "Every big achievement starts with the decision to try.",
  "Focus on progress, not perfection.",
  "Today is another chance to get closer to your goals.",
  "Small steps every day lead to big results over time.",
  "You don't have to be perfect to make a difference.",
  "The best time to start is now.",
  "Clarity is power. You've got this.",
  "One focused day can change everything.",
  "Trust the process, one task at a time.",
  "Your consistency is your superpower.",
  "Deep work today pays dividends tomorrow.",
  "Great work starts with a clear plan.",
  "Do the most important thing first.",
  "Success is the sum of small efforts, repeated day in and day out.",
  "Discipline is choosing between what you want now and what you want most.",
  "Make today count.",
  "You've planned it. Now own it.",
  "A plan without action is a dream. Let's make it real.",
  "Energy follows intention.",
  "Momentum starts with a single step.",
  "Your future self will thank you for the work you do today.",
  "The secret to getting ahead is getting started.",
  "Prioritize ruthlessly. Protect your focus time.",
  "Less, but better.",
  "Done is better than perfect. Ship it.",
  "Every expert was once a beginner. Keep going.",
  "The work is its own reward.",
  "Quality attention on quality work.",
  "Make it happen, one task at a time.",
  "Your best work begins with a clear mind and a bold plan.",
];

const QUOTES_ZH = [
  "每一个伟大的成就，都始于决定去尝试。",
  "专注于进步，而非完美。",
  "今天是离目标更近一步的机会。",
  "每天的小进步，终将汇成巨大的成果。",
  "你不必完美，也能做出改变。",
  "最好的开始时间就是现在。",
  "清晰即力量。你可以的。",
  "一天的专注，可以改变一切。",
  "信任过程，一次只做一件事。",
  "你的持续努力，就是你的超能力。",
  "今天的深度工作，明天的丰厚回报。",
  "清晰的计划，是卓越工作的起点。",
  "先做最重要的那件事。",
  "成功是每天小努力的积累，一点一滴。",
  "自律，就是在想做的和最想要的之间做出选择。",
  "让今天有意义。",
  "你已经做好了计划，现在去执行它。",
  "没有行动的计划只是梦想，让我们让它成真。",
  "能量跟随意图。",
  "动力从第一步开始。",
  "未来的你，会感谢今天努力工作的自己。",
  "前进的秘诀就是开始。",
  "果断取舍，保护你的专注时间。",
  "少，但更好。",
  "完成胜于完美，先做出来。",
  "每一位专家曾经都是初学者，继续前行。",
  "工作本身就是回报。",
  "高质量的注意力，放在高质量的工作上。",
  "一次一个任务，让它发生。",
  "最好的工作，始于清醒的头脑和大胆的计划。",
];

function getDayQuote(locale: string): string {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const doy = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  const pool = locale === "zh" ? QUOTES_ZH : QUOTES_EN;
  return pool[doy % pool.length];
}

// ─── Step: Carry Forward ───────────────────────────────────────────────────

interface CarryStepProps {
  prevToday: Task[];
  decisions: Map<string, "keep" | "defer">;
  onToggle: (id: string, decision: "keep" | "defer") => void;
}

function CarryStep({ prevToday, decisions, onToggle }: CarryStepProps) {
  const t = useT();
  const ls = useLocaleString();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("planning.step.carry.sub")}
      </p>
      <div className="flex flex-col gap-2 mt-1">
        {prevToday.map((task) => {
          const decision = decisions.get(task.id) ?? "keep";
          return (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg"
              style={{
                padding: "10px 12px",
                background: "var(--bg-deep)",
                border: "1px solid var(--border-faint)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  <TaskTitle text={ls(task.title)} />
                </div>
                {task.quadrant !== "unclassified" && (
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {task.quadrant}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onToggle(task.id, "keep")}
                  className="text-xs rounded-md"
                  style={{
                    padding: "4px 10px",
                    minHeight: 44,
                    border: "1px solid",
                    borderColor: decision === "keep" ? "var(--accent-primary)" : "var(--border-default)",
                    background: decision === "keep" ? "var(--accent-dim)" : "transparent",
                    color: decision === "keep" ? "var(--accent-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: decision === "keep" ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {t("planning.carry.keep")}
                </button>
                <button
                  onClick={() => onToggle(task.id, "defer")}
                  className="text-xs rounded-md"
                  style={{
                    padding: "4px 10px",
                    minHeight: 44,
                    border: "1px solid",
                    borderColor: decision === "defer" ? "var(--border-default)" : "var(--border-faint)",
                    background: decision === "defer" ? "var(--bg-elevated)" : "transparent",
                    color: decision === "defer" ? "var(--text-muted)" : "var(--text-faint)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {t("planning.carry.defer")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: Select Tasks ────────────────────────────────────────────────────

interface SelectStepProps {
  pool: Task[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function SelectStep({ pool, selected, onToggle }: SelectStepProps) {
  const t = useT();
  const ls = useLocaleString();
  const q1q2Count = pool.filter((tk) => selected.has(tk.id)).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {t("planning.step.select.sub")}
      </p>

      {/* Selection counter */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          {t("planning.selected").replace("{n}", String(q1q2Count))}
        </span>
        {q1q2Count >= MAX_TODAY && (
          <span
            className="text-xs font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            {t("planning.step.select.limit")}
          </span>
        )}
      </div>

      {pool.length === 0 ? (
        <div
          className="text-sm text-center rounded-lg"
          style={{ padding: "24px 16px", color: "var(--text-faint)", background: "var(--bg-deep)" }}
        >
          {t("today.empty.sub")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {pool.map((task) => {
            const isSelected = selected.has(task.id);
            const isAtLimit = !isSelected && q1q2Count >= MAX_TODAY;
            return (
              <button
                key={task.id}
                onClick={() => onToggle(task.id)}
                disabled={isAtLimit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid",
                  borderColor: isSelected ? "var(--accent-primary)" : "var(--border-faint)",
                  background: isSelected ? "var(--accent-dim)" : "var(--bg-deep)",
                  opacity: isAtLimit ? 0.4 : 1,
                  cursor: isAtLimit ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  minHeight: 44,
                }}
              >
                {/* Checkbox indicator */}
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "var(--radius-sm)",
                    border: `2px solid ${isSelected ? "var(--accent-primary)" : "var(--border-default)"}`,
                    background: isSelected ? "var(--accent-primary)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12l5 5 11-11" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium leading-snug"
                    style={{ color: isSelected ? "var(--accent-primary)" : "var(--text-primary)" }}
                  >
                    <TaskTitle text={ls(task.title)} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color: task.quadrant === "Q1" ? "var(--q1-color)" : "var(--q2-color)",
                      }}
                    >
                      {task.quadrant}
                    </span>
                    {task.due && (
                      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        · {task.due}
                      </span>
                    )}
                    {task.reason && (
                      <span className="text-[11px] truncate" style={{ color: "var(--text-faint)" }}>
                        · {ls(task.reason)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step: AI Review ───────────────────────────────────────────────────────

function AIStep({ message }: { message: string | null }) {
  const t = useT();
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: 120, padding: "8px 0" }}
    >
      {message === null ? (
        <div className="flex flex-col items-center gap-4">
          <div className="lumo-glyph" style={{ width: 32, height: 32 }}>
            <div className="halo" />
            <div className="core" />
          </div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("planning.ai.analyzing")}
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="lumo-glyph" style={{ width: 28, height: 28 }}>
            <div className="halo" />
            <div className="core" />
          </div>
          <p
            className="text-base leading-relaxed"
            style={{ color: "var(--text-primary)", fontStyle: "italic", maxWidth: 360 }}
          >
            "{message}"
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Step: Done ────────────────────────────────────────────────────────────

function DoneStep({ quote, species }: { quote: string; species: PetSpecies }) {
  const t = useT();

  return (
    <div className="flex flex-col items-center text-center gap-4">
      <PetSvg species={species} mood="excited" size={72} />
      <div>
        <div
          className="font-semibold text-base mb-2"
          style={{ color: "var(--accent-primary)" }}
        >
          {t("planning.step.done.sub")}
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-secondary)", fontStyle: "italic", maxWidth: 320 }}
        >
          "{quote}"
        </p>
      </div>
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────

interface MorningPlanningModalProps {
  onClose: () => void;
}

export function MorningPlanningModal({ onClose }: MorningPlanningModalProps) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const tasks = useTasksStore((s) => s.tasks);
  const update = useTasksStore((s) => s.update);
  const { activeProvider, providerConfigs } = useAIStore();
  const petSpecies = usePetStore((s) => s.species);
  const hasAI = providerConfigs[activeProvider]?.hasKey ?? false;

  // Previous today tasks (unfinished)
  const prevToday = useMemo(
    () => tasks.filter((tk) => tk.today && !tk.completed),
    [tasks]
  );

  // Q1 + Q2 pool, sorted by quadrant then conviction
  const pool = useMemo(
    () =>
      tasks
        .filter((tk) => !tk.completed && (tk.quadrant === "Q1" || tk.quadrant === "Q2"))
        .sort((a, b) => {
          if (a.quadrant !== b.quadrant) return a.quadrant === "Q1" ? -1 : 1;
          return (b.conviction ?? 0) - (a.conviction ?? 0);
        }),
    [tasks]
  );

  // Steps based on conditions
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = [];
    if (prevToday.length > 0) s.push("carry");
    s.push("select");
    if (hasAI) s.push("ai");
    s.push("done");
    return s;
  }, [prevToday.length, hasAI]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  // Carry decisions: default all to "keep"
  const [decisions, setDecisions] = useState<Map<string, "keep" | "defer">>(
    () => new Map(prevToday.map((tk) => [tk.id, "keep"] as const))
  );

  // Selected task IDs for today (starts with all prevToday kept)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(prevToday.map((tk) => tk.id))
  );

  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quote = useMemo(() => getDayQuote(locale), [locale]);

  // Generate AI message when entering AI step
  useEffect(() => {
    if (step !== "ai") return;
    const selInPool = pool.filter((tk) => selected.has(tk.id));
    if (selInPool.length === 0) {
      setAiMsg(t("planning.ai.empty"));
      return;
    }
    const urgentMissed = pool.find(
      (tk) => tk.quadrant === "Q1" && !selected.has(tk.id) && !!tk.due
    );
    if (urgentMissed) {
      setAiMsg(
        t("planning.ai.q1skipped").replace("{task}", ls(urgentMissed.title))
      );
    } else {
      setAiMsg(t("planning.ai.focused"));
    }
  }, [step, pool, selected, t, ls]);

  function handleCarryToggle(id: string, decision: "keep" | "defer") {
    setDecisions((prev) => new Map(prev).set(id, decision));
    setSelected((prev) => {
      const next = new Set(prev);
      if (decision === "defer") next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTaskToggle(id: string) {
    if (selected.has(id)) {
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      return;
    }
    const q1q2Count = pool.filter((tk) => selected.has(tk.id)).length;
    if (q1q2Count >= MAX_TODAY) return;
    setSelected((prev) => new Set(prev).add(id));
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      // Clear today from prevToday tasks not selected
      for (const tk of prevToday) {
        if (!selected.has(tk.id)) {
          await update(tk.id, { today: false });
        }
      }
      // Set today: true for all selected tasks
      for (const id of selected) {
        const task = tasks.find((tk) => tk.id === id);
        if (task && !task.today) {
          await update(id, { today: true });
        }
      }
      // Store planning completion date (local time — matches TodayPage check)
      localStorage.setItem("lumo.planning_done_date", toISODate(new Date()));
      usePetStore.getState().celebrate("pet.celebrate.alldone");
      onClose();
    } catch {
      // A task update failed mid-flight; the store already surfaces a toast.
      // Leave the modal open (not marked done) so the user can retry — the
      // today writes are idempotent, so re-running is safe.
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (step === "done") {
      finish();
    } else if (stepIdx < steps.length - 1) {
      setStepIdx((s) => s + 1);
    }
  }

  function goBack() {
    if (stepIdx > 0) setStepIdx((s) => s - 1);
  }

  const isLastStep = step === "done";
  const q1q2Count = pool.filter((tk) => selected.has(tk.id)).length;

  const stepLabel = t("planning.progress")
    .replace("{step}", String(stepIdx + 1))
    .replace("{total}", String(steps.length));

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      ref={dialogRef}
      tabIndex={-1}
      aria-label={t("planning.title")}
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
            {step === "carry" && t("planning.step.carry.title")}
            {step === "select" && t("planning.step.select.title")}
            {step === "ai" && t("planning.step.ai.title")}
            {step === "done" && t("planning.step.done.title")}
          </h2>
        </div>

        {/* Step content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 20px 0",
          }}
        >
          {step === "carry" && (
            <CarryStep
              prevToday={prevToday}
              decisions={decisions}
              onToggle={handleCarryToggle}
            />
          )}
          {step === "select" && (
            <SelectStep
              pool={pool}
              selected={selected}
              onToggle={handleTaskToggle}
            />
          )}
          {step === "ai" && <AIStep message={aiMsg} />}
          {step === "done" && <DoneStep quote={quote} species={petSpecies} />}
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
              {t("planning.btn.back")}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step === "select" && q1q2Count > 0 && (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              {t("planning.selected").replace("{n}", String(q1q2Count))}
            </span>
          )}
          <button
            onClick={goNext}
            disabled={busy}
            aria-busy={busy}
            className="btn btn-primary"
            style={{ minHeight: 44, minWidth: 100 }}
          >
            {busy ? <Spinner /> : isLastStep ? t("planning.btn.finish") : t("planning.btn.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
