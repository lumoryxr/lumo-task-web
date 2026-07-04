import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CompletedTimeline } from "@/components/CompletedTimeline";
import { EveningReviewModal } from "@/components/EveningReviewModal";
import { MorningPlanningModal } from "@/components/MorningPlanningModal";
import { WeeklyPlanningModal, isWeeklyPlanned } from "@/components/WeeklyPlanningModal";
import { TaskRow } from "@/components/TaskRow";
import { TaskTitle } from "@/components/TaskTitle";
import { TodayHero } from "@/components/TodayHero";
import { BatchActionBar } from "@/components/BatchActionBar";
import { FilterChip } from "@/components/FilterChip";
import { TaskListSkeleton } from "@/components/skeletons";
import { IconArrowRight } from "@/components/icons";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { usePetStore } from "@/store/usePetStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { derivePlanProjects, derivePlanTags, resolveActiveFilter, filterPlanTasks } from "@/utils/planFilters";
import { useIsMobile } from "@/hooks/useIsMobile";
import { fmtDuration, toISODate } from "@/lib/format";
import type { Locale, Task } from "@/types/task";

function getPlanningDoneDate(): string | null {
  try {
    return localStorage.getItem("lumo.planning_done_date");
  } catch {
    return null;
  }
}

function isTodayPlanned(): boolean {
  return getPlanningDoneDate() === toISODate(new Date());
}

function isEveningReviewDone(): boolean {
  try {
    return localStorage.getItem("lumo.evening_review_done_date") === toISODate(new Date());
  } catch {
    return false;
  }
}

const Q_PRIORITY: Record<Task["quadrant"], number> = {
  Q1: 0, Q2: 1, Q3: 2, Q4: 3, unclassified: 4,
};

const Q_CHIP: Record<string, string> = {
  Q1: "chip chip-q1",
  Q2: "chip chip-q2",
  Q3: "chip chip-q3",
  Q4: "chip chip-q4",
  unclassified: "chip",
};

// ─── Conviction Card ───────────────────────────────────────────────────────

interface ConvictionCardProps {
  task: Task;
  tasks: Task[];
  locale: Locale;
}

function ConvictionCard({ task, tasks, locale }: ConvictionCardProps) {
  const navigate = useNavigate();
  const t = useT();
  const ls = useLocaleString();
  const isMobile = useIsMobile();

  const conviction = task.conviction ?? 0.9;
  const targetPct = Math.round(conviction * 100);
  const [displayPct, setDisplayPct] = useState(0);
  const [barPct, setBarPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setDisplayPct(0);
    setBarPct(0);
    let start: number | null = null;
    const duration = 1100;

    const timeout = setTimeout(() => {
      const animate = (ts: number) => {
        if (!start) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        setDisplayPct(Math.round(ease * targetPct));
        setBarPct(ease * conviction * 100);
        if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    }, 220);

    return () => { clearTimeout(timeout); cancelAnimationFrame(rafRef.current); };
  }, [task.id, targetPct, conviction]);

  const notNow = task.not_now ?? [];
  const chipClass = Q_CHIP[task.quadrant] ?? "chip";

  return (
    <article
      className="conviction-card relative overflow-hidden rounded-xl"
      style={{
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 220px",
        boxShadow: "var(--shadow-lifted)",
      }}
    >
      {/* Top accent scan line — animates in */}
      <div
        className="conviction-scanline absolute left-0 right-0 top-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, var(--accent-edge) 25%, var(--accent-primary) 50%, var(--accent-edge) 75%, transparent 100%)",
        }}
      />

      {/* Ambient halo — top-right glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -80, right: -40, width: 260, height: 260,
          background: "radial-gradient(circle, var(--accent-fog) 0%, transparent 65%)",
          animation: "lumoBreath 5s ease-in-out infinite",
        }}
      />

      {/* ── Left column ── */}
      <div
        className="relative flex flex-col"
        style={{ padding: "26px 28px 24px", borderRight: "1px solid var(--border-faint)" }}
      >
        {/* Header: Lumo orb + label + quadrant chip */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className="lumo-glyph">
            <div className="halo" />
            <div className="core" />
          </div>
          <span
            className="text-[11px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            {t("today.recommended")}
          </span>
          <span className="flex-1" />
          <span className={chipClass} style={{ fontSize: 10 }}>
            {task.quadrant === "unclassified" ? "—" : task.quadrant}
          </span>
          {!task.today && (
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {locale === "zh" ? "待办" : "backlog"}
            </span>
          )}
        </div>

        {/* Reason quote */}
        {task.reason && (
          <p
            className="text-[13px] leading-relaxed mb-4"
            style={{ color: "var(--text-secondary)", fontStyle: "italic", maxWidth: 560 }}
          >
            "{ls(task.reason)}"
          </p>
        )}

        {/* Task title */}
        <h2
          className="font-semibold leading-snug tracking-tight mb-4"
          style={{ fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.01em", maxWidth: 560 }}
        >
          <TaskTitle text={ls(task.title)} />
        </h2>

        {/* Meta row */}
        <div
          className="flex items-center gap-4 text-xs tabular-nums mb-5"
          style={{ color: "var(--text-muted)" }}
        >
          {task.due && (
            <span>
              <span style={{ color: "var(--text-faint)" }}>{t("today.due")} · </span>
              {task.due === "today" ? (locale === "zh" ? "今天" : "Today") : task.due}
            </span>
          )}
          <span>
            <span style={{ color: "var(--text-faint)" }}>{t("today.est")} · </span>
            {fmtDuration(task.duration, locale)}
          </span>
          <span className="pip">
            {Array.from({ length: task.pomos_total }).map((_, i) => (
              <i key={i} className={i < task.pomos_done ? "on" : ""} />
            ))}
          </span>
        </div>

        {/* Next step */}
        {task.next_step && (
          <div className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--text-faint)" }}>
              {locale === "zh" ? "下一步 · " : "Next step · "}
            </span>
            {ls(task.next_step)}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2.5 mt-auto">
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/focus", { state: { taskId: task.id } })}>
            {t("today.start")} <IconArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Right column — conviction sidecar ── */}
      {!isMobile && <div
        className="relative flex flex-col gap-5"
        style={{
          padding: "26px 22px 24px",
          background: "linear-gradient(180deg, var(--accent-fog) 0%, transparent 55%)",
        }}
      >
        {/* Conviction score */}
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-faint)" }}
          >
            {t("today.conviction")}
          </div>

          {/* Animated number */}
          <div
            className="flex items-baseline gap-1 mb-2.5 tabular-nums"
            style={{ fontSize: 38, fontWeight: 700, color: "var(--accent-primary)", letterSpacing: "-0.025em" }}
          >
            {displayPct}
            <span style={{ fontSize: 18, fontWeight: 500, color: "var(--text-muted)" }}>%</span>
          </div>

          {/* Animated bar */}
          <div
            className="h-[3px] w-full rounded-full overflow-hidden"
            style={{ background: "var(--bg-deep)" }}
          >
            <div
              style={{
                width: `${barPct}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--accent-dim), var(--accent-primary))",
                boxShadow: "0 0 8px var(--accent-primary)",
              }}
            />
          </div>
        </div>

        {/* Divider */}
        {notNow.length > 0 && (
          <div className="h-px w-full" style={{ background: "var(--border-faint)" }} />
        )}

        {/* Not now list */}
        {notNow.length > 0 && (
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-3"
              style={{ color: "var(--text-faint)" }}
            >
              {t("today.notnow")}
            </div>
            <div className="flex flex-col gap-3.5">
              {notNow.map((nn) => {
                const ref = tasks.find((x) => x.id === nn.id);
                if (!ref) return null;
                return (
                  <div key={nn.id}>
                    <div
                      className="text-xs font-medium leading-snug mb-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <TaskTitle text={ls(ref.title)} />
                    </div>
                    <div
                      className="text-[11px] leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {ls(nn.reason)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>}
    </article>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────

function TodayEmptyState() {
  const navigate = useNavigate();
  const t = useT();
  const locale = useAppStore((s) => s.locale);

  return (
    <div
      className="fade-in flex flex-col items-center justify-center text-center"
      style={{ minHeight: "65vh", padding: "48px 32px" }}
    >
      {/* Breathing triple-ring orb */}
      <div className="relative mb-10" style={{ width: 136, height: 136 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 65%)",
            animation: "lumoBreath 4s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            inset: 24,
            border: "1px solid var(--accent-edge)",
            animation: "lumoBreath 4s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            inset: 42,
            border: "1px solid var(--accent-primary)",
            opacity: 0.35,
            animation: "lumoBreath 3.2s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            inset: 56,
            background: "var(--accent-primary)",
            boxShadow: "0 0 20px var(--accent-primary)",
            animation: "lumoBreath 4s ease-in-out infinite",
          }}
        />
      </div>

      <h2
        className="font-semibold mb-3"
        style={{ fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
      >
        {t("today.empty.title")}
      </h2>
      <p
        className="text-sm leading-relaxed mb-8"
        style={{ color: "var(--text-secondary)", maxWidth: 360 }}
      >
        {t("today.empty.sub")}
      </p>

      <button className="btn btn-secondary" onClick={() => navigate("/matrix")}>
        {t("today.empty.cta")}
        <span style={{ marginLeft: 4, opacity: 0.7 }}>→</span>
      </button>

      {/* Subtle hint row */}
      <div
        className="flex items-center gap-5 mt-12 text-[11px] tabular-nums"
        style={{ color: "var(--text-faint)" }}
      >
        {(locale === "zh"
          ? ["Q1 · 立即做", "Q2 · 安排做", "Q3 · 委托做"]
          : ["Q1 · Do first", "Q2 · Schedule", "Q3 · Delegate"]
        ).map((label, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-full"
              style={{
                width: 6, height: 6,
                background: ["var(--q1-color)", "var(--q2-color)", "var(--q3-color)"][i],
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Confetti colors for the all-done celebration
const CONFETTI_COLORS = ["#3dffa0", "#ff6b6b", "#a8e64b", "#5bc8d4", "#ffb347"];

// ─── All-done Banner ────────────────────────────────────────────────────────

function AllDoneBanner() {
  const t = useT();

  useEffect(() => {
    usePetStore.getState().celebrate("pet.celebrate.alldone");
  }, []);

  const confetti = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${6 + (i * 6) % 88}%`,
    delay: `${(i * 0.12).toFixed(2)}s`,
    duration: `${0.9 + (i % 4) * 0.25}s`,
  }));

  return (
    <div
      className="fade-in relative flex items-center gap-4 rounded-xl border mb-10 overflow-hidden"
      style={{
        padding: "18px 24px",
        borderColor: "var(--accent-edge)",
        background: "linear-gradient(135deg, var(--accent-fog) 0%, var(--bg-surface) 60%)",
        boxShadow: "0 0 30px var(--accent-fog)",
      }}
    >
      {/* Confetti particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {confetti.map((c) => (
          <div
            key={c.id}
            className="absolute"
            style={{
              width: 5,
              height: 8,
              top: -10,
              left: c.left,
              borderRadius: 2,
              background: c.color,
              animation: `confettiFall ${c.duration} ${c.delay} ease-in both`,
            }}
          />
        ))}
      </div>
      {/* Animated orb */}
      <div className="lumo-glyph flex-shrink-0" style={{ width: 20, height: 20 }}>
        <div className="halo" />
        <div className="core" />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="font-semibold text-sm"
          style={{ color: "var(--accent-primary)" }}
        >
          {t("today.alldone.title")}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {t("today.alldone.sub")}
        </div>
      </div>

      {/* Subtle checkmark cluster */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-full border-2 flex items-center justify-center"
            style={{
              width: 16, height: 16,
              borderColor: "var(--accent-primary)",
              background: "var(--accent-dim)",
              opacity: 0.4 + i * 0.2,
              transform: `scale(${0.75 + i * 0.125})`,
            }}
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--bg-base)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12l5 5 11-11" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Planning Banner ────────────────────────────────────────────────────────

function PlanningBanner({ onOpen, planned }: { onOpen: () => void; planned: boolean }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl mb-6"
      style={{
        padding: "12px 16px",
        border: "1px solid var(--accent-edge)",
        background: planned
          ? "var(--bg-surface)"
          : "linear-gradient(135deg, var(--accent-fog) 0%, var(--bg-surface) 70%)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        minHeight: 52,
        transition: "opacity 0.15s",
      }}
    >
      <div className="lumo-glyph flex-shrink-0" style={{ width: 18, height: 18 }}>
        <div className="halo" />
        <div className="core" />
      </div>
      <span
        className="text-sm font-medium"
        style={{ color: planned ? "var(--text-secondary)" : "var(--accent-primary)", flex: 1 }}
      >
        {planned ? t("today.planning.btn.adjust") : t("today.planning.btn.start")}
      </span>
      <span style={{ color: "var(--text-faint)", fontSize: 14 }}>›</span>
    </button>
  );
}

// ─── Weekly Planning Banner ─────────────────────────────────────────────────

function WeeklyPlanningBanner({ onOpen, planned }: { onOpen: () => void; planned: boolean }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl mb-3"
      style={{
        padding: "10px 16px",
        border: `1px solid ${planned ? "var(--border-faint)" : "var(--border-default)"}`,
        background: planned ? "var(--bg-surface)" : "var(--bg-deep)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        minHeight: 44,
        transition: "opacity 0.15s",
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>★</span>
      <span
        className="text-sm font-medium"
        style={{ color: planned ? "var(--text-faint)" : "var(--text-secondary)", flex: 1 }}
      >
        {planned ? t("weekly.planning.btn.adjust") : t("weekly.planning.btn.start")}
      </span>
      <span style={{ color: "var(--text-faint)", fontSize: 14 }}>›</span>
    </button>
  );
}

// ─── Week Focus Section ─────────────────────────────────────────────────────

interface WeekFocusSectionProps {
  weekFocusTasks: Task[];
}

function WeekFocusSection({ weekFocusTasks }: WeekFocusSectionProps) {
  const t = useT();
  const ls = useLocaleString();
  const update = useTasksStore((s) => s.update);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("lumo.week_focus_collapsed") === "1"; } catch { return false; }
  });
  const [addingId, setAddingId] = useState<string | null>(null);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("lumo.week_focus_collapsed", next ? "1" : "0"); } catch { /* noop */ }
  }

  if (weekFocusTasks.length === 0) return null;

  return (
    <section className="mb-6">
      <button
        onClick={toggleCollapse}
        className="flex items-center gap-2 w-full text-left mb-2"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--accent-primary)" }}
        >
          {t("weekly.focus.section").replace("{n}", String(weekFocusTasks.length))}
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 11, marginLeft: "auto" }}>
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1">
          {weekFocusTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg"
              style={{
                padding: "8px 12px",
                background: "var(--bg-deep)",
                border: "1px solid var(--border-faint)",
              }}
            >
              <span style={{ color: "var(--accent-primary)", fontSize: 12, flexShrink: 0 }}>★</span>
              <span
                className="flex-1 text-[13px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                <TaskTitle text={ls(task.title)} />
              </span>
              {!task.today && (
                <button
                  onClick={async () => {
                    if (addingId) return;
                    setAddingId(task.id);
                    try { await update(task.id, { today: true }); } finally { setAddingId(null); }
                  }}
                  disabled={addingId === task.id}
                  aria-busy={addingId === task.id}
                  aria-label={t("weekly.focus.add_today")}
                  className="text-[11px] flex-shrink-0 inline-flex items-center justify-center"
                  style={{
                    color: "var(--accent-primary)",
                    background: "none",
                    border: "none",
                    cursor: addingId === task.id ? "default" : "pointer",
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    opacity: addingId === task.id ? 0.5 : 1,
                  }}
                >
                  {addingId === task.id ? <Spinner size={12} /> : t("weekly.focus.add_today")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Evening Review Banner ──────────────────────────────────────────────────

function EveningReviewBanner({ onOpen, done }: { onOpen: () => void; done: boolean }) {
  const t = useT();
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl mb-6"
      style={{
        padding: "12px 16px",
        border: "1px solid var(--border-faint)",
        background: done ? "var(--bg-surface)" : "var(--bg-deep)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        minHeight: 52,
        transition: "opacity 0.15s",
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>🌙</span>
      <span
        className="text-sm font-medium"
        style={{ color: done ? "var(--text-faint)" : "var(--text-secondary)", flex: 1 }}
      >
        {done ? t("today.evening.btn.done") : t("today.evening.btn.start")}
      </span>
      <span style={{ color: "var(--text-faint)", fontSize: 14 }}>›</span>
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function TodayPage() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const loading = useTasksStore((s) => s.loading);
  const weekFocusTasks = useTasksStore((s) => s.weekFocusTasks)();
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planned, setPlanned] = useState(isTodayPlanned);
  const [eveningOpen, setEveningOpen] = useState(false);
  const [eveningDone, setEveningDone] = useState(isEveningReviewDone);
  const [searchParams, setSearchParams] = useSearchParams();
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyPlanned, setWeeklyPlanned] = useState(isWeeklyPlanned);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const projects = useProjectsStore((s) => s.projects);
  const selectMode = useTasksStore((s) => s.selectMode);
  const setSelectMode = useTasksStore((s) => s.setSelectMode);
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore(selectIsSignedIn);

  // Leaving the page exits select mode so a stray selection never lingers.
  useEffect(() => () => setSelectMode(false), [setSelectMode]);

  // Auto-open modals when navigated here from a notification click
  useEffect(() => {
    if (searchParams.get("planning") === "open") {
      setPlanningOpen(true);
      setSearchParams({}, { replace: true });
    } else if (searchParams.get("evening") === "open") {
      setEveningOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Compute last week's stats from completed entries for the WeeklyPlanningModal
  const prevWeekStats = useMemo(() => {
    const now = new Date();
    const prevWeekStart = new Date(now);
    prevWeekStart.setDate(now.getDate() - now.getDay() - 6); // last Mon
    prevWeekStart.setHours(0, 0, 0, 0);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekStart.getDate() + 6);
    prevWeekEnd.setHours(23, 59, 59, 999);
    const entries = completed.filter((e) => {
      if (!e.completedAt) return false;
      const d = new Date(e.completedAt);
      return d >= prevWeekStart && d <= prevWeekEnd;
    });
    return {
      tasksCompleted: entries.length,
      focusMinutes: entries.reduce((s, e) => s + (e.duration ?? 0), 0),
    };
  }, [completed]);

  // Previous week's focus tasks (those with week_focus true, already completed or not)
  const prevWeekFocusTasks = useMemo(
    () => tasks.filter((tk) => tk.week_focus),
    [tasks]
  );

  function handlePlanningClose() {
    setPlanningOpen(false);
    setPlanned(isTodayPlanned());
  }

  function handleEveningClose() {
    setEveningOpen(false);
    setEveningDone(isEveningReviewDone());
  }

  function handleWeeklyClose() {
    setWeeklyOpen(false);
    setWeeklyPlanned(isWeeklyPlanned());
  }

  if (loading && tasks.length === 0) {
    return <TaskListSkeleton />;
  }

  const incomplete = [...tasks]
    .filter((x) => !x.completed)
    .sort((a, b) => Q_PRIORITY[a.quadrant] - Q_PRIORITY[b.quadrant]);

  const top =
    incomplete.find((x) => x.today && x.quadrant === "Q1") ??
    incomplete.find((x) => x.quadrant === "Q1") ??
    incomplete[0];

  const todayRest = tasks
    .filter((x) => x.today && !x.completed && x.id !== top?.id)
    .sort((a, b) => Q_PRIORITY[a.quadrant] - Q_PRIORITY[b.quadrant]);

  // Distinct tags across today's plan, for the filter bar. A filter that no
  // longer matches any task (e.g. its last task got completed) is dropped so we
  // never show an empty filtered list with no way back.
  const planTags = derivePlanTags(todayRest);
  const activeTag = resolveActiveFilter(tagFilter, planTags);

  // Distinct projects across today's plan (#223 V2 ⭐2), resolved to names.
  // Same auto-drop-stale-filter rule as tags so the list never gets stuck empty.
  const planProjects = derivePlanProjects(todayRest, projects);
  const activeProject = resolveActiveFilter(projectFilter, planProjects.map((p) => p.id));

  const visibleRest = filterPlanTasks(todayRest, activeTag, activeProject);

  const todayAllDone =
    tasks.filter((x) => x.today && !x.completed).length === 0 && completed.length > 0;

  // Hero summary: today's completion. done = entries completed today; remaining
  // = today-flagged tasks still open. Total drives the progress ring + subline.
  const todayISO = toISODate(new Date());
  const doneToday = completed.filter(
    (e) => e.completedAt && toISODate(new Date(e.completedAt)) === todayISO,
  ).length;
  const remainingToday = tasks.filter((x) => x.today && !x.completed).length;
  const totalToday = doneToday + remainingToday;
  const heroName = isSignedIn ? user.name : undefined;

  if (!top && completed.length === 0) {
    return (
      <>
        <div className="px-4 sm:px-7 pt-6 sm:pt-7">
          <TodayHero name={heroName} done={doneToday} total={totalToday} />
          <PlanningBanner onOpen={() => setPlanningOpen(true)} planned={planned} />
          <WeeklyPlanningBanner onOpen={() => setWeeklyOpen(true)} planned={weeklyPlanned} />
          <EveningReviewBanner onOpen={() => setEveningOpen(true)} done={eveningDone} />
          <WeekFocusSection weekFocusTasks={weekFocusTasks} />
        </div>
        <TodayEmptyState />
        {planningOpen && <MorningPlanningModal onClose={handlePlanningClose} />}
        {eveningOpen && <EveningReviewModal onClose={handleEveningClose} />}
        {weeklyOpen && (
          <WeeklyPlanningModal
            onClose={handleWeeklyClose}
            prevWeekStats={prevWeekStats}
            prevWeekFocusTasks={prevWeekFocusTasks}
          />
        )}
      </>
    );
  }

  return (
    <div className="fade-in px-4 sm:px-7 py-6 sm:py-7">
      <TodayHero name={heroName} done={doneToday} total={totalToday} />

      {/* Morning planning banner — always visible */}
      <PlanningBanner onOpen={() => setPlanningOpen(true)} planned={planned} />

      {/* Weekly planning banner */}
      <WeeklyPlanningBanner onOpen={() => setWeeklyOpen(true)} planned={weeklyPlanned} />

      {/* Evening review banner — always visible */}
      <EveningReviewBanner onOpen={() => setEveningOpen(true)} done={eveningDone} />

      {/* This week's focus — shown above today's tasks when set */}
      <WeekFocusSection weekFocusTasks={weekFocusTasks} />

      {!top && completed.length > 0 && (
        <AllDoneBanner />
      )}

      {top && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint mb-3 flex items-center gap-2">
            {t("today.recommended")}
            {todayAllDone && (
              <span className="chip chip-ai">
                {locale === "zh" ? "来自待办" : "from backlog"}
              </span>
            )}
          </div>

          <ConvictionCard task={top} tasks={tasks} locale={locale} />
        </>
      )}

      {todayRest.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">
              {t("today.plan")}
            </div>
            {!selectMode && (
              <button
                onClick={() => setSelectMode(true)}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md text-text-secondary hover:text-text-primary transition-colors"
                style={{ border: "1px solid var(--border-default)" }}
              >
                {t("batch.select")}
              </button>
            )}
          </div>
          {planProjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label={t("project.filter.label")}>
              <FilterChip
                label={t("project.filter.all")}
                active={!activeProject}
                onClick={() => setProjectFilter(null)}
              />
              {planProjects.map((p) => (
                <FilterChip
                  key={p.id}
                  label={p.name}
                  active={activeProject === p.id}
                  onClick={() => setProjectFilter(activeProject === p.id ? null : p.id)}
                />
              ))}
            </div>
          )}
          {planTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label={t("tag.filter.label")}>
              <FilterChip
                label={t("tag.filter.all")}
                active={!activeTag}
                onClick={() => setTagFilter(null)}
              />
              {planTags.map((tag) => (
                <FilterChip
                  key={tag}
                  label={tag}
                  active={activeTag === tag}
                  onClick={() => setTagFilter(activeTag === tag ? null : tag)}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {visibleRest.map((task) => (
              <TaskRow key={task.id} task={task} selectable />
            ))}
          </div>
        </section>
      )}

      <BatchActionBar candidateIds={visibleRest.map((x) => x.id)} />

      {completed.length > 0 && (
        <CompletedTimeline entries={completed} locale={locale} />
      )}

      {planningOpen && <MorningPlanningModal onClose={handlePlanningClose} />}
      {eveningOpen && <EveningReviewModal onClose={handleEveningClose} />}
      {weeklyOpen && (
        <WeeklyPlanningModal
          onClose={handleWeeklyClose}
          prevWeekStats={prevWeekStats}
          prevWeekFocusTasks={prevWeekFocusTasks}
        />
      )}
    </div>
  );
}
