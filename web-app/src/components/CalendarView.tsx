import { useEffect, useRef, useState } from "react";
import { useTasksStore } from "@/store/useTasksStore";
import { useAppStore } from "@/store/useAppStore";
import { useCalendarStore } from "@/store/useCalendarStore";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import type { Task, Locale } from "@/types/task";
import { fmtDuration, parseDueISO, toISODate } from "@/lib/format";
import { TaskDetailModal } from "./TaskDetailModal";
import { OutlookEventCard } from "./OutlookEventCard";
import { QuickCreate } from "./QuickCreate";
import { IconCheck, IconClose } from "./icons";

const DND_MIME = "application/x-lumo-task";

/* ── Time grid constants ─────────────────────────────────────────── */

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_H = 64;       // px per hour
const SLOT_MINS = 15;    // snap granularity
const MIN_BLOCK_H = 28;  // minimum block height in px
const GRID_H = (END_HOUR - START_HOUR) * HOUR_H;

function yToScheduledStart(y: number, dayIso: string): string {
  const totalMins = Math.round((y / HOUR_H) * 60 / SLOT_MINS) * SLOT_MINS;
  const clamped = Math.max(0, Math.min((END_HOUR - START_HOUR) * 60 - SLOT_MINS, totalMins));
  const h = START_HOUR + Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${dayIso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function scheduledStartToTop(iso: string): number {
  const t = new Date(iso);
  return (t.getHours() - START_HOUR + t.getMinutes() / 60) * HOUR_H;
}

function durationToHeight(mins: number): number {
  return Math.max((mins / 60) * HOUR_H, MIN_BLOCK_H);
}

function fmtHourLabel(h: number): string {
  if (h === 0 || h === 12) return h === 0 ? "12am" : "12pm";
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function fmtScheduledTime(iso: string): string {
  const t = new Date(iso);
  const h = t.getHours();
  const m = t.getMinutes();
  const suffix = h >= 12 ? "pm" : "am";
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${displayH}${suffix}` : `${displayH}:${String(m).padStart(2, "0")}${suffix}`;
}

/* ── Date helpers ────────────────────────────────────────────────── */

interface WeekDay {
  date: Date;
  iso: string;
  isToday: boolean;
}

function getWeekDays(weekOffset: number): WeekDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISODate(today);
  const dow = today.getDay();
  const daysFromMon = (dow + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon + weekOffset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = toISODate(d);
    return { date: d, iso, isToday: iso === todayISO };
  });
}

const EN_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function weekRangeLabel(days: WeekDay[], locale: Locale): string {
  const first = days[0].date;
  const last = days[6].date;
  if (locale === "zh") {
    const y = first.getFullYear();
    if (first.getMonth() === last.getMonth()) {
      return `${y}年${first.getMonth() + 1}月${first.getDate()}–${last.getDate()}日`;
    }
    return `${y}年${first.getMonth() + 1}月${first.getDate()}日–${last.getMonth() + 1}月${last.getDate()}日`;
  }
  if (first.getMonth() === last.getMonth()) {
    return `${EN_MONTHS[first.getMonth()]} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`;
  }
  return `${EN_MONTHS[first.getMonth()]} ${first.getDate()} – ${EN_MONTHS[last.getMonth()]} ${last.getDate()}, ${first.getFullYear()}`;
}

const DAY_ABBR: Record<number, Record<Locale, string>> = {
  0: { en: "Sun", zh: "日" },
  1: { en: "Mon", zh: "一" },
  2: { en: "Tue", zh: "二" },
  3: { en: "Wed", zh: "三" },
  4: { en: "Thu", zh: "四" },
  5: { en: "Fri", zh: "五" },
  6: { en: "Sat", zh: "六" },
};

/* ── Drop indicator state ────────────────────────────────────────── */

interface DropIndicator {
  dayIso: string;
  top: number;
  scheduledStart: string;
}

/* ── Main CalendarView ───────────────────────────────────────────── */

export function CalendarView() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const tasks = useTasksStore((s) => s.tasks);
  const update = useTasksStore((s) => s.update);

  const connected = useCalendarStore((s) => s.connected);
  const outlookEvents = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  const [weekOffset, setWeekOffset] = useState(0);
  const [overUnscheduled, setOverUnscheduled] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [qcOpen, setQcOpen] = useState(false);
  const [qcTitle, setQcTitle] = useState("");
  const [qcDue, setQcDue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const days = getWeekDays(weekOffset);

  // Scroll to 8am on first render
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_H;
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    const d = getWeekDays(weekOffset);
    const endDate = new Date(d[6].date);
    endDate.setHours(23, 59, 59, 999);
    fetchEvents(d[0].date.toISOString(), endDate.toISOString());
  }, [weekOffset, connected, fetchEvents]);

  function openQCFromEvent(title: string, due: string) {
    setQcTitle(title);
    setQcDue(due);
    setQcOpen(true);
  }

  // Partition Outlook events into day buckets
  const eventBuckets = new Map<string, typeof outlookEvents>();
  days.forEach((d) => eventBuckets.set(d.iso, []));
  for (const evt of outlookEvents) {
    const dateStr = evt.start.dateTime.substring(0, 10);
    if (eventBuckets.has(dateStr)) {
      eventBuckets.get(dateStr)!.push(evt);
    }
  }

  // Partition active tasks into: scheduled (with time), all-day (due only), and all-tasks list
  const scheduledBuckets = new Map<string, Task[]>(); // tasks with scheduled_start
  const allDayBuckets = new Map<string, Task[]>();    // tasks with due but no scheduled_start
  const allActiveTasks: Task[] = [];
  days.forEach((d) => { scheduledBuckets.set(d.iso, []); allDayBuckets.set(d.iso, []); });

  for (const task of tasks) {
    if (task.completed) continue;
    allActiveTasks.push(task);
    if (task.scheduled_start) {
      const dayIso = task.scheduled_start.substring(0, 10);
      if (scheduledBuckets.has(dayIso)) {
        scheduledBuckets.get(dayIso)!.push(task);
      }
    } else {
      const iso = parseDueISO(task.due);
      if (iso && allDayBuckets.has(iso)) {
        allDayBuckets.get(iso)!.push(task);
      }
    }
  }

  function makeTimeGridDrop(dayIso: string) {
    return {
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes(DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const y = Math.max(0, e.clientY - rect.top);
        const scheduledStart = yToScheduledStart(y, dayIso);
        const snapTop = scheduledStartToTop(scheduledStart);
        setDropIndicator({ dayIso, top: snapTop, scheduledStart });
      },
      onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDropIndicator(null);
        }
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const id = e.dataTransfer.getData(DND_MIME);
        if (id && dropIndicator?.dayIso === dayIso) {
          update(id, { due: dayIso, scheduled_start: dropIndicator.scheduledStart });
        }
        setDropIndicator(null);
      },
    };
  }

  function makeAllDayDrop(dayIso: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData(DND_MIME);
        if (id) update(id, { due: dayIso, scheduled_start: null });
      },
    };
  }

  const unscheduledDrop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverUnscheduled(true);
    },
    onDragLeave: () => setOverUnscheduled(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOverUnscheduled(false);
      const id = e.dataTransfer.getData(DND_MIME);
      if (id) update(id, { due: null, scheduled_start: null });
    },
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* ── Week navigation ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-7 py-2.5 flex-shrink-0 border-b"
        style={{ borderColor: "var(--border-faint)" }}
      >
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="btn btn-ghost text-[12px] px-2.5 py-1"
          aria-label={t("calendar.prev")}
        >
          ← {t("calendar.prev")}
        </button>
        <span className="flex-1 text-center text-[13px] font-medium text-text-primary tabular-nums select-none">
          {weekRangeLabel(days, locale)}
        </span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="btn btn-ghost text-[12px] px-2.5 py-1"
          aria-label={t("calendar.next")}
        >
          {t("calendar.next")} →
        </button>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="btn btn-secondary text-[11px] px-2.5 py-1">
            {t("calendar.today.btn")}
          </button>
        )}
      </div>

      {/* ── Main body ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Unscheduled panel ──────────────────────────────────── */}
        <div
          {...unscheduledDrop}
          className="flex flex-col border-r flex-shrink-0 min-h-0 transition-colors"
          style={{
            width: 148,
            borderColor: "var(--border-faint)",
            background: overUnscheduled ? "var(--accent-fog)" : "transparent",
          }}
        >
          <div
            className="px-3 pt-3 pb-2 border-b flex-shrink-0"
            style={{ borderColor: "var(--border-faint)" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-faint">
              {t("calendar.unscheduled")}
            </span>
            {allActiveTasks.length > 0 && (
              <span className="ml-1.5 text-[10px] text-text-muted">{allActiveTasks.length}</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
            {allActiveTasks.length === 0 ? (
              <div className="text-[11px] text-text-faint italic px-1 py-2">
                {overUnscheduled ? t("calendar.unscheduled.hint") : "—"}
              </div>
            ) : (
              allActiveTasks.map((task) => <UnscheduledChip key={task.id} task={task} />)
            )}
          </div>
        </div>

        {/* ── Right section: day headers + scrollable time grid ──── */}
        <div className="flex flex-1 flex-col min-h-0 min-w-0">

          {/* Day header row (fixed) */}
          <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--border-faint)" }}>
            {/* Spacer for time ruler */}
            <div className="flex-shrink-0" style={{ width: 48 }} />
            {days.map((day) => {
              const abbr = DAY_ABBR[day.date.getDay()][locale];
              const allDayTasks = allDayBuckets.get(day.iso) ?? [];
              const evts = eventBuckets.get(day.iso) ?? [];
              return (
                <div
                  key={day.iso}
                  {...makeAllDayDrop(day.iso)}
                  className="flex-1 flex flex-col border-r min-w-0"
                  style={{
                    minWidth: 80,
                    borderColor: "var(--border-faint)",
                    background: day.isToday ? "rgba(61,255,160,0.03)" : "transparent",
                  }}
                >
                  {/* Day label */}
                  <div className="flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: day.isToday ? "var(--accent-primary)" : "var(--text-faint)" }}
                    >
                      {abbr}
                    </span>
                    <span
                      className="flex items-center justify-center rounded-full text-[13px] font-semibold tabular-nums leading-none"
                      style={{
                        width: 26, height: 26,
                        background: day.isToday ? "var(--accent-primary)" : "transparent",
                        color: day.isToday ? "var(--bg-base)" : "var(--text-primary)",
                      }}
                    >
                      {day.date.getDate()}
                    </span>
                  </div>
                  {/* All-day chips area */}
                  {(allDayTasks.length > 0 || evts.length > 0) && (
                    <div className="px-1 pb-1.5 flex flex-col gap-0.5">
                      {allDayTasks.map((task) => (
                        <AllDayChip key={task.id} task={task} />
                      ))}
                      {evts.map((evt) => (
                        <OutlookEventCard key={evt.id} event={evt} onCreateTask={openQCFromEvent} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scrollable time grid */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ position: "relative" }}>
            <div className="flex" style={{ height: GRID_H }}>

              {/* Time ruler */}
              <div className="flex-shrink-0 relative" style={{ width: 48 }}>
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    className="absolute w-full flex items-start justify-end"
                    style={{ top: i * HOUR_H - 7, paddingRight: 8 }}
                  >
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                      {i === 0 ? "" : fmtHourLabel(START_HOUR + i)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day time columns */}
              {days.map((day) => {
                const scheduled = scheduledBuckets.get(day.iso) ?? [];
                const isDropTarget = dropIndicator?.dayIso === day.iso;

                return (
                  <div
                    key={day.iso}
                    {...makeTimeGridDrop(day.iso)}
                    className="flex-1 relative border-r min-w-0"
                    style={{
                      minWidth: 80,
                      borderColor: "var(--border-faint)",
                      background: day.isToday ? "rgba(61,255,160,0.02)" : "transparent",
                    }}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0"
                        style={{
                          top: i * HOUR_H,
                          borderTop: `1px solid var(--border-faint)`,
                        }}
                      />
                    ))}

                    {/* Half-hour lines (lighter) */}
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div
                        key={`h${i}`}
                        className="absolute left-0 right-0"
                        style={{
                          top: i * HOUR_H + HOUR_H / 2,
                          borderTop: `1px dashed var(--border-faint)`,
                          opacity: 0.5,
                        }}
                      />
                    ))}

                    {/* Drop indicator line */}
                    {isDropTarget && dropIndicator && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: dropIndicator.top }}
                      >
                        <div
                          className="absolute left-0 right-0 h-[2px]"
                          style={{ background: "var(--accent-primary)", boxShadow: "0 0 6px var(--accent-glow)" }}
                        />
                        <span
                          className="absolute left-1 top-1 text-[10px] font-semibold px-1 rounded"
                          style={{
                            background: "var(--accent-primary)",
                            color: "var(--bg-base)",
                            lineHeight: "14px",
                          }}
                        >
                          {fmtScheduledTime(dropIndicator.scheduledStart)}
                        </span>
                      </div>
                    )}

                    {/* Time blocks */}
                    {scheduled.map((task) => (
                      <TimeBlock
                        key={task.id}
                        task={task}
                        onClearTime={() => update(task.id, { scheduled_start: null })}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {qcOpen && (
        <QuickCreate
          initialTitle={qcTitle}
          initialDue={qcDue}
          onClose={() => setQcOpen(false)}
          onCreated={() => setQcOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Drag helper ──────────────────────────────────────────────────── */

function makeDragProps(taskId: string) {
  return {
    draggable: true as const,
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

/* ── Unscheduled panel chip ──────────────────────────────────────── */

function UnscheduledChip({ task }: { task: Task }) {
  const ls = useLocaleString();
  const t = useT();
  const [detailOpen, setDetailOpen] = useState(false);

  const hasScheduled = Boolean(task.scheduled_start);
  const hasDue = Boolean(task.due);

  return (
    <>
      <div
        {...makeDragProps(task.id)}
        onClick={() => setDetailOpen(true)}
        className="flex flex-col gap-0.5 px-2 py-1.5 rounded-md border cursor-grab active:cursor-grabbing text-[11px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        style={{ borderColor: "var(--border-faint)", background: "var(--bg-subtle)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className={`qdot qdot-${task.quadrant.toLowerCase()} flex-shrink-0`} />
          <span className="truncate flex-1"><TaskTitle text={ls(task.title)} /></span>
        </div>
        <div className="flex items-center gap-1 ml-0.5">
          {hasScheduled ? (
            <span
              className="text-[9px] font-medium px-1 py-0.5 rounded"
              style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
            >
              {t("calendar.badge.scheduled")}
            </span>
          ) : hasDue ? (
            <span
              className="text-[9px] font-medium px-1 py-0.5 rounded"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border-faint)" }}
            >
              {t("calendar.badge.due")}
            </span>
          ) : (
            <span
              className="text-[9px] font-medium px-1 py-0.5 rounded"
              style={{ color: "var(--text-faint)" }}
            >
              {t("calendar.badge.nodate")}
            </span>
          )}
        </div>
      </div>
      {detailOpen && <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />}
    </>
  );
}

/* ── All-day chip (in day header) ────────────────────────────────── */

function AllDayChip({ task }: { task: Task }) {
  const t = useT();
  const ls = useLocaleString();
  const [detailOpen, setDetailOpen] = useState(false);
  const complete = useTasksStore((s) => s.complete);

  return (
    <>
      <div
        {...makeDragProps(task.id)}
        onClick={() => setDetailOpen(true)}
        className="flex items-center gap-1 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing text-[10px] transition-colors hover:opacity-80 group"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
        }}
      >
        <span className={`qdot qdot-${task.quadrant.toLowerCase()} flex-shrink-0`} />
        <span className="truncate flex-1"><TaskTitle text={ls(task.title)} /></span>
        <button
          onClick={(e) => { e.stopPropagation(); complete(task.id); }}
          aria-label={t("row.complete")}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--accent-primary)" }}
        >
          <IconCheck size={10} strokeWidth={2.5} />
        </button>
      </div>
      {detailOpen && <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />}
    </>
  );
}

/* ── Time block (absolutely positioned in the time grid) ─────────── */

const Q_BLOCK: Record<string, { bg: string; border: string; bar: string }> = {
  Q1: { bg: "rgba(255,107,107,0.08)", border: "rgba(255,107,107,0.3)", bar: "var(--q1-color)" },
  Q2: { bg: "rgba(91,200,212,0.08)", border: "rgba(91,200,212,0.3)", bar: "var(--q2-color)" },
  Q3: { bg: "rgba(255,179,71,0.08)", border: "rgba(255,179,71,0.3)", bar: "var(--q3-color)" },
  Q4: { bg: "rgba(160,173,176,0.08)", border: "rgba(160,173,176,0.3)", bar: "var(--q4-color)" },
  unclassified: { bg: "var(--bg-subtle)", border: "var(--border-faint)", bar: "var(--text-faint)" },
};

function TimeBlock({ task, onClearTime }: { task: Task; onClearTime: () => void }) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const complete = useTasksStore((s) => s.complete);

  const [hovered, setHovered] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const top = scheduledStartToTop(task.scheduled_start!);
  const height = durationToHeight(task.duration || 30);
  const colors = Q_BLOCK[task.quadrant] ?? Q_BLOCK.unclassified;
  const startLabel = fmtScheduledTime(task.scheduled_start!);

  return (
    <>
      <div
        {...makeDragProps(task.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="absolute left-1 right-1 rounded-md overflow-hidden cursor-grab active:cursor-grabbing transition-all z-10"
        style={{
          top,
          height,
          background: colors.bg,
          border: `1px solid ${hovered ? colors.bar : colors.border}`,
          boxShadow: hovered ? `0 0 0 1px ${colors.bar}22` : "none",
        }}
      >
        {/* Quadrant accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-md"
          style={{ width: 3, background: colors.bar }}
        />

        {/* Content */}
        <div
          className="ml-[7px] pr-1 py-1 h-full flex flex-col cursor-pointer overflow-hidden"
          onClick={() => setDetailOpen(true)}
        >
          <span
            className="text-[11px] font-medium leading-tight"
            style={{ color: "var(--text-primary)", wordBreak: "break-word" }}
          >
            <TaskTitle text={ls(task.title)} />
          </span>
          {height >= 40 && (
            <span className="text-[10px] tabular-nums mt-0.5" style={{ color: "var(--text-faint)" }}>
              {startLabel}
              {task.duration > 0 && ` · ${fmtDuration(task.duration, locale)}`}
            </span>
          )}
        </div>

        {/* Action buttons — visible on hover */}
        {hovered && (
          <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); complete(task.id); }}
              title={t("row.complete")}
              className="flex items-center justify-center w-[16px] h-[16px] rounded transition-colors"
              style={{ color: "var(--accent-primary)", background: "var(--accent-fog)" }}
            >
              <IconCheck size={9} strokeWidth={2.5} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClearTime(); }}
              title={t("calendar.block.clear")}
              className="flex items-center justify-center w-[16px] h-[16px] rounded transition-colors"
              style={{ color: "var(--text-faint)", background: "var(--bg-subtle)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}
            >
              <IconClose size={8} />
            </button>
          </div>
        )}
      </div>
      {detailOpen && <TaskDetailModal task={task} onClose={() => setDetailOpen(false)} />}
    </>
  );
}
