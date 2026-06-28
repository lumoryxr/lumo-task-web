import { useEffect, useRef } from "react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useAppStore } from "@/store/useAppStore";
import { parseDueISO, toISODate } from "@/lib/format";
import type { Task } from "@/types/task";

function todayISO(): string {
  return toISODate(new Date());
}

function alreadySent(type: string): boolean {
  return localStorage.getItem(`lumo:notif:${type}:${todayISO()}`) === "1";
}

function markSent(type: string): void {
  localStorage.setItem(`lumo:notif:${type}:${todayISO()}`, "1");
}

function msUntil(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - Date.now();
}

function taskTitle(task: Task, locale: string): string {
  return (locale === "zh" ? task.title.zh : undefined) ?? task.title.en;
}

async function sendNotification(
  title: string,
  options: NotificationOptions & { data?: Record<string, string> }
): Promise<void> {
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    } catch {
      // fall through to direct Notification
    }
  }
  const n = new Notification(title, options);
  const action = options.data?.action;
  // Mirror sw.js notificationclick routing so the direct-Notification fallback
  // is clickable for every action (morning, evening, due, default).
  const target =
    action === "morning" ? "/today?planning=open"
    : action === "evening" ? "/today?evening=open"
    : "/today";
  n.onclick = () => { window.focus(); window.location.href = target; };
}

export function useNotificationScheduler(): void {
  const { enabled, morningTime, eveningTime, dueAlertsEnabled } = useNotificationStore();
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const locale = useAppStore((s) => s.locale);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!enabled) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const today = todayISO();

    // ── Morning Planning Reminder ────────────────────────────────────
    {
      const delay = msUntil(morningTime);
      const id = setTimeout(() => {
        if (alreadySent("morning")) return;

        const todayTasks = tasks.filter((t) => t.today && !t.completed);
        const unclassified = tasks.filter((t) => t.quadrant === "unclassified" && !t.completed);

        let body: string;
        if (todayTasks.length > 0) {
          body = locale === "zh"
            ? `还有 ${todayTasks.length} 个任务等待今日确认`
            : `${todayTasks.length} task${todayTasks.length !== 1 ? "s" : ""} waiting for today`;
        } else if (unclassified.length > 0) {
          body = locale === "zh"
            ? `有 ${unclassified.length} 个任务待分类`
            : `${unclassified.length} task${unclassified.length !== 1 ? "s" : ""} need classification`;
        } else {
          body = locale === "zh"
            ? "打开晨间规划，选出今日焦点"
            : "Open morning planning to set today's focus";
        }

        sendNotification(
          locale === "zh" ? "☀️ 早安，开始规划今天吧" : "☀️ Good morning — time to plan your day",
          { body, icon: "/favicon.ico", data: { action: "morning" } }
        );
        markSent("morning");
      }, delay);
      timers.current.push(id);
    }

    // ── Q1 Due Task Alert (30 min before morning) ────────────────────
    if (dueAlertsEnabled) {
      const [mh, mm] = morningTime.split(":").map(Number);
      const totalMinutes = ((mh * 60 + mm - 30) % 1440 + 1440) % 1440;
      const alertH = Math.floor(totalMinutes / 60);
      const alertM = totalMinutes % 60;
      const alertTime = `${String(alertH).padStart(2, "0")}:${String(alertM).padStart(2, "0")}`;
      const delay = msUntil(alertTime);

      const id = setTimeout(() => {
        if (alreadySent("due")) return;

        const dueTasks = tasks.filter(
          (t) => !t.completed && parseDueISO(t.due) === today && (t.quadrant === "Q1" || t.today)
        );
        if (dueTasks.length === 0) return;

        const title =
          dueTasks.length === 1
            ? locale === "zh"
              ? `⏰ 今日到期：${taskTitle(dueTasks[0], locale)}`
              : `⏰ Due today: ${taskTitle(dueTasks[0], locale)}`
            : locale === "zh"
              ? `⏰ 今日有 ${dueTasks.length} 个任务到期，点击查看`
              : `⏰ ${dueTasks.length} tasks due today — tap to review`;

        sendNotification(title, { icon: "/favicon.ico", data: { action: "due" } });
        markSent("due");
      }, delay);
      timers.current.push(id);
    }

    // ── Evening Review Reminder ──────────────────────────────────────
    {
      const delay = msUntil(eveningTime);
      const id = setTimeout(() => {
        if (alreadySent("evening")) return;

        const todayDone = completed.filter((e) => e.completedAt?.startsWith(today));
        const totalMin = todayDone.reduce((s, e) => s + (e.duration || 0), 0);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;

        const body =
          todayDone.length === 0
            ? locale === "zh"
              ? "今天还没有完成记录，花 5 分钟回顾一下"
              : "No completions today — take 5 minutes to review"
            : locale === "zh"
              ? `完成了 ${todayDone.length} 个任务 · 共专注 ${h > 0 ? `${h}小时` : ""}${m > 0 ? `${m}分钟` : "0分钟"}`
              : `Completed ${todayDone.length} task${todayDone.length !== 1 ? "s" : ""} · ${h > 0 ? `${h}h ` : ""}${m}min focused`;

        sendNotification(
          locale === "zh" ? "🌙 今天干得怎么样？来复盘一下" : "🌙 How was your day? Time to review",
          { body, icon: "/favicon.ico", data: { action: "evening" } }
        );
        markSent("evening");
      }, delay);
      timers.current.push(id);
    }

    // ── Per-task reminders ───────────────────────────────────────────
    // Each open task with a `remind_at` fires once at its (local wall-clock)
    // time. Dedup key includes the timestamp, so editing the time re-arms it.
    // A reminder whose time already passed while the app was closed fires on
    // open (catch-up); ones beyond the horizon are armed on a later effect run
    // (task-list change / app reopen), keeping setTimeout delays bounded.
    {
      const HORIZON_MS = 24 * 60 * 60 * 1000;
      for (const t of tasks) {
        if (t.completed || !t.remind_at) continue;
        const ts = new Date(t.remind_at).getTime();
        if (Number.isNaN(ts)) continue;
        const key = `lumo:notif:task:${t.id}:${t.remind_at}`;
        if (localStorage.getItem(key) === "1") continue;

        const fire = () => {
          if (localStorage.getItem(key) === "1") return;
          sendNotification(
            locale === "zh" ? `⏰ 提醒：${taskTitle(t, locale)}` : `⏰ Reminder: ${taskTitle(t, locale)}`,
            {
              body: locale === "zh" ? "该处理这个任务了" : "Time to work on this task",
              icon: "/favicon.ico",
              data: { action: "due" },
            }
          );
          localStorage.setItem(key, "1");
        };

        const delay = ts - Date.now();
        if (delay <= 0) {
          fire(); // catch-up for a reminder that elapsed while the app was closed
        } else if (delay <= HORIZON_MS) {
          timers.current.push(setTimeout(fire, delay));
        }
      }
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [enabled, morningTime, eveningTime, dueAlertsEnabled, tasks, completed, locale]);
}
