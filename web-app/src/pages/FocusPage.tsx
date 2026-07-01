import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { IconArrowLeft, IconCheck, IconPause, IconPlay } from "@/components/icons";
import { TaskTitle } from "@/components/TaskTitle";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useTasksStore } from "@/store/useTasksStore";
import { usePetStore } from "@/store/usePetStore";
import { computeAllTimeStats } from "@/utils/stats";
import { fmtDuration, fmtMMSS } from "@/lib/format";
import { DogSvg } from "@/components/DogSvg";
import { useNotificationStore } from "@/store/useNotificationStore";

const DEFAULT_DURATION = 25 * 60;

/**
 * Pomodoro focus session — full-bleed timer, top strip with the current
 * task. Pause/Resume + Mark complete.
 */
export function FocusPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const tasks = useTasksStore((s) => s.tasks);
  const complete = useTasksStore((s) => s.complete);

  // Use the task the user explicitly started focus on (passed via router state).
  // When navigating directly to /focus without a taskId, show the empty landing page.
  const requestedId = (location.state as { taskId?: string } | null)?.taskId;
  const task = requestedId
    ? (tasks.find((x) => x.id === requestedId && !x.completed) ??
        tasks.find((x) => x.today && x.quadrant === "Q1" && !x.completed) ??
        tasks.find((x) => x.today && !x.completed) ??
        tasks.find((x) => x.quadrant === "Q1" && !x.completed) ??
        tasks.find((x) => !x.completed))
    : null;

  const isFallbackTask = !!task && !task.today;

  // Task duration in seconds — only computed once the task is known.
  const taskDuration = task && task.duration > 0 ? task.duration * 60 : DEFAULT_DURATION;

  const [remaining, setRemaining] = useState(taskDuration);
  const [paused, setPaused] = useState(false);
  const [compact, setCompact] = useState(false);
  const [petBounce, setPetBounce] = useState(false);
  const [timerReady, setTimerReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const notificationsEnabled = useNotificationStore((s) => s.enabled);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  // Kept current so the timer callback (fires outside render) localizes the
  // completion notification with the latest locale.
  const tRef = useRef(t);
  tRef.current = t;
  const notifEnabledRef = useRef(notificationsEnabled);
  notifEnabledRef.current = notificationsEnabled;

  // Mutable refs so interval callback always reads latest values without stale closures.
  const remainingRef = useRef(taskDuration);
  const pausedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedForRef = useRef<string | null>(null);

  function stopInterval() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  // Clear interval on unmount. Permission is now managed by the notifications settings panel.
  useEffect(() => {
    return () => { stopInterval(); startedForRef.current = null; };
  }, []);

  // Start/restart timer when the task (and its duration) becomes known.
  useEffect(() => {
    if (!task) return;
    const key = `${task.id}:${taskDuration}`;
    if (startedForRef.current === key) return;
    startedForRef.current = key;

    stopInterval();
    remainingRef.current = taskDuration;
    pausedRef.current = false;
    setPaused(false);
    setRemaining(taskDuration);
    setTimerReady(true);

    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const next = Math.max(0, remainingRef.current - 1);
      remainingRef.current = next;
      setRemaining(next);
      if (next === 0) {
        stopInterval();
        if (notifEnabledRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(tRef.current("focus.notify.title"), {
            body: tRef.current("focus.notify.body"),
            icon: "/favicon.ico",
          });
        }
        setPetBounce(true);
        setTimeout(() => setPetBounce(false), 1200);
        useTasksStore.getState().fetchAllCompleted().then((entries) => {
          const { currentStreak } = computeAllTimeStats(entries);
          if (currentStreak === 7 || currentStreak === 14 || currentStreak === 30) {
            usePetStore.getState().celebrate(`pet.streak.${currentStreak}`);
          }
        }).catch(() => {});
      }
    }, 1000);
  }, [task?.id, taskDuration]);

  // Keep pausedRef in sync so the interval callback reads the latest value.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  function enterCompact() {
    setCompact(true);
    window.electronAPI?.enterFocusMode();
  }

  function exitCompact() {
    setCompact(false);
    window.electronAPI?.exitFocusMode();
  }

  if (!task) {
    return (
      <div
        className="fade-in flex flex-col items-center justify-center h-full relative"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 100%, rgba(61,255,160,0.04) 0%, transparent 70%), var(--bg-base)",
        }}
      >
        {/* Ghost atmosphere ring — dimmed, no progress arc */}
        <div className="relative mb-10" style={{ width: 280, height: 280 }}>
          {/* Ambient glow — breathing softly */}
          <div
            className="absolute rounded-full"
            style={{
              inset: -20,
              background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 65%)",
              opacity: 0.35,
              animation: "lumoBreath 5s ease-in-out infinite",
            }}
          />
          {/* Ghost SVG ring */}
          <svg viewBox="0 0 280 280" className="absolute inset-0" style={{ opacity: 0.18 }}>
            <circle cx="140" cy="140" r="120" fill="none" stroke="var(--accent-primary)" strokeWidth="2" />
          </svg>
          {/* Outer border ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: "0.5px solid var(--accent-edge)", opacity: 0.3 }}
          />

          {/* Center — Lumo waiting state */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {/* Breathing triple orb */}
            <div className="relative" style={{ width: 56, height: 56 }}>
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
                  animation: "lumoBreath 4s ease-in-out infinite",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  inset: 10,
                  border: "1px solid var(--accent-edge)",
                  animation: "lumoBreath 4s ease-in-out infinite reverse",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  inset: 20,
                  background: "var(--accent-primary)",
                  boxShadow: "0 0 14px var(--accent-primary)",
                  animation: "lumoBreath 4s ease-in-out infinite",
                }}
              />
            </div>

            {/* Ghost time display */}
            <div
              className="font-mono tabular-nums"
              style={{
                fontSize: 38,
                fontWeight: 200,
                letterSpacing: "-0.04em",
                color: "var(--text-faint)",
                lineHeight: 1,
              }}
            >
              25:00
            </div>
          </div>
        </div>

        {/* Text */}
        <h2
          className="font-semibold mb-2.5 text-center"
          style={{ fontSize: 20, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
        >
          {t("focus.empty.title")}
        </h2>
        <p
          className="text-sm leading-relaxed text-center mb-8"
          style={{ color: "var(--text-secondary)", maxWidth: 300 }}
        >
          {t("focus.empty.sub")}
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/today")}>
            {t("focus.empty.cta")}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/matrix")}>
            {t("focus.empty.matrix")}
          </button>
        </div>
      </div>
    );
  }

  const progress = taskDuration > 0 ? (taskDuration - remaining) / taskDuration : 0;
  const turns = -90 + progress * 360;

  async function onComplete() {
    if (compact) exitCompact();
    if (task) await complete(task.id);
    navigate("/today");
  }

  // ── Compact pet widget (Electron only) ──────────────────────────────────────
  // Minimal desktop-pet: just the dog + a small time badge.
  // Click anywhere to restore the full window.
  if (compact) {
    const petMood = paused ? "idle" : remaining < 60 ? "excited" : "happy";
    const nearDone = remaining < 60;
    return (
      <div
        onClick={exitCompact}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "var(--bg-base)",
          // no-drag so onClick fires — window position is managed by main process
          WebkitAppRegion: "no-drag",
          userSelect: "none",
          cursor: "pointer",
          padding: "8px 4px 12px",
          boxSizing: "border-box",
        } as React.CSSProperties}
      >
        {/* Dog — click to restore */}
        <div
          onClick={exitCompact}
          title={t("focus.compact.restore")}
          style={{
            flex: "0 0 auto",
            cursor: "pointer",
            animation: petBounce ? "petBounce 0.4s ease-in-out 3" : undefined,
            filter: paused ? "grayscale(0.4)" : undefined,
            transition: "filter 400ms",
          }}
        >
          <DogSvg mood={petMood} size={72} />
        </div>

        {/* Time badge */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: nearDone ? "var(--accent-primary)" : "var(--text-secondary)",
            background: "var(--bg-elevated)",
            border: `1px solid ${nearDone ? "var(--accent-edge)" : "var(--border-faint)"}`,
            borderRadius: "var(--radius-md)",
            padding: "2px 8px",
            boxShadow: nearDone ? "0 0 8px var(--accent-fog)" : undefined,
            transition: "color 300ms, border-color 300ms",
          }}
        >
          {fmtMMSS(remaining)}
        </div>

        {/* Restore hint — always visible */}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-faint)",
            letterSpacing: "0.01em",
          }}
        >
          {t("focus.compact.restore")}
        </div>

        {/* Exit focus button */}
        <button
          disabled={exiting}
          onClick={async (e) => {
            e.stopPropagation();
            setExiting(true);
            exitCompact();
            try {
              if (task) await complete(task.id);
            } catch {
              // best-effort — navigate away regardless
            }
            navigate("/today");
          }}
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "var(--text-faint)",
            background: "none",
            border: "none",
            cursor: exiting ? "default" : "pointer",
            textDecoration: "underline",
            padding: 0,
            opacity: exiting ? 0.4 : 1,
          }}
        >
          {t("focus.compact.exit")}
        </button>
      </div>
    );
  }

  return (
    <div
      className="fade-in flex flex-col h-full relative"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 100%, rgba(61,255,160,0.05) 0%, transparent 70%), var(--bg-base)",
      }}
    >
      {/* Top strip */}
      <header className="flex items-center gap-3.5 px-8 py-5 border-b border-border-faint">
        <span className="chip chip-q1">{task.quadrant !== "unclassified" ? task.quadrant : "—"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-text-primary leading-snug"><TaskTitle text={ls(task.title)} /></div>
            {isFallbackTask && (
              <span
                className="text-[10px] rounded-full flex-shrink-0"
                style={{
                  padding: "1px 7px",
                  background: "var(--bg-subtle)",
                  color: "var(--text-faint)",
                  border: "1px solid var(--border-faint)",
                }}
              >
                {t("focus.fallback.badge")}
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {task.next_step
              ? ls(task.next_step)
              : task.duration > 0
              ? `${t("focus.sub.prefix")} ${fmtDuration(task.duration, locale)}`
              : t("focus.sub")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent-primary)", boxShadow: "0 0 8px var(--accent-primary)" }}
          />
          <span>{t("focus.dnd")}</span>
        </div>
        {isElectron && (
          <button
            className="btn btn-ghost"
            style={{ height: 30 }}
            onClick={enterCompact}
            title={t("focus.compact.enter")}
          >
            🐕 {t("focus.compact.enter")}
          </button>
        )}
        <button className="btn btn-ghost" style={{ height: 30 }} onClick={() => navigate("/today")}>
          <IconArrowLeft size={14} />
          {t("focus.exit")}
        </button>
      </header>

      {/* Atmosphere + countdown */}
      <div className="flex-1 flex items-center justify-center relative min-h-0">
        <div className="relative" style={{ width: 380, height: 380 }}>
          <div
            className="absolute rounded-full"
            style={{
              inset: -20,
              background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 65%)",
              opacity: paused ? 0.3 : 0.9,
              transition: "opacity 600ms var(--ease-default)",
            }}
          />
          <div className="absolute inset-0 rounded-full" style={{ border: "0.5px solid var(--accent-edge)" }} />
          <svg viewBox="0 0 380 380" className="absolute inset-0">
            <defs>
              <linearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-primary)" />
                <stop offset="100%" stopColor="var(--accent-dim)" />
              </linearGradient>
            </defs>
            <circle cx="190" cy="190" r="160" fill="none" stroke="var(--border-default)" strokeWidth="2" opacity="0.6" />
            <circle
              cx="190"
              cy="190"
              r="160"
              fill="none"
              stroke="url(#progGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 160}
              strokeDashoffset={(1 - progress) * 2 * Math.PI * 160}
              transform="rotate(-90 190 190)"
              style={{
                filter: "drop-shadow(0 0 8px var(--accent-primary))",
                transition: timerReady ? "stroke-dashoffset 1s linear" : "none",
              }}
            />
            <circle
              cx={190 + 160 * Math.cos((turns * Math.PI) / 180)}
              cy={190 + 160 * Math.sin((turns * Math.PI) / 180)}
              r="5"
              fill="var(--accent-primary)"
              style={{ filter: "drop-shadow(0 0 6px var(--accent-primary))" }}
            />
          </svg>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-faint">
            {t("focus.round")} {task.pomos_done + 1} {t("focus.of")} {task.pomos_total}
          </div>
          <div
            className="font-mono text-text-primary tabular-nums"
            style={{ fontSize: 88, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em", margin: "8px 0" }}
          >
            {fmtMMSS(remaining)}
          </div>
          <div className="flex flex-col items-center gap-2 mt-3 pointer-events-auto">
            {/* Primary: Mark complete */}
            <button
              onClick={onComplete}
              className="flex items-center gap-2 rounded-full transition-all text-sm font-semibold"
              style={{
                padding: "11px 36px",
                background: "var(--accent-primary)",
                color: "var(--bg-base)",
                border: "1.5px solid var(--accent-primary)",
                boxShadow: "0 0 24px var(--accent-fog)",
              }}
            >
              <IconCheck size={15} />
              {t("focus.complete")}
            </button>
            {/* Secondary: Pause / Resume */}
            <button
              onClick={() => setPaused((p) => !p)}
              title={paused ? t("focus.resume") : t("focus.pause")}
              className="focus-complete-btn flex items-center gap-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ padding: "6px 18px" }}
            >
              {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
              {paused ? t("focus.resume") : t("focus.pause")}
            </button>
          </div>
          <div className="mt-3.5 flex gap-5 text-[11px] text-text-muted tabular-nums">
            <span>
              {t("focus.est")} {fmtDuration(task.duration, locale)}
            </span>
            <span>
              {t("focus.actual")} {fmtMMSS(taskDuration - remaining)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
