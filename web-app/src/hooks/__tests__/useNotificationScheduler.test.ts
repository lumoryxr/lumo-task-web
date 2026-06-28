import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Task } from "@/types/task";
import { useNotificationScheduler } from "../useNotificationScheduler";

// ─── Store mocks ─────────────────────────────────────────────────────────────

let ENABLED = true;
let MORNING_TIME = "09:00";
let EVENING_TIME = "18:00";
let DUE_ALERTS = true;
let TASKS: Task[] = [];
let COMPLETED: { completedAt?: string; duration?: number }[] = [];
let LOCALE = "en";

vi.mock("@/store/useNotificationStore", () => ({
  useNotificationStore: () => ({
    enabled: ENABLED,
    morningTime: MORNING_TIME,
    eveningTime: EVENING_TIME,
    dueAlertsEnabled: DUE_ALERTS,
  }),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: (s: unknown) => unknown) =>
    sel({ tasks: TASKS, completed: COMPLETED }),
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: (s: { locale: string }) => unknown) =>
    sel({ locale: LOCALE }),
}));

// ─── Notification mock ────────────────────────────────────────────────────────

const mockNotification = vi.fn();
mockNotification.prototype.onclick = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(override: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: { en: "Task A", zh: "任务 A" },
    quadrant: "Q1",
    today: false,
    week_focus: false,
    completed: false,
    duration: 30,
    pomos_done: 0,
    pomos_total: 1,
    due: null,
    ...override,
  };
}

/** Returns ms until a given HH:MM today (or tomorrow if already past). */
function msUntilTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime() - Date.now();
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  ENABLED = true;
  MORNING_TIME = "09:00";
  EVENING_TIME = "18:00";
  DUE_ALERTS = true;
  TASKS = [];
  COMPLETED = [];
  LOCALE = "en";

  vi.useFakeTimers();

  // Freeze time so todayISO() is predictable
  const now = new Date("2026-06-21T07:00:00");
  vi.setSystemTime(now);

  // Stub localStorage
  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => store[k] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => { store[k] = v; });

  // Stub Notification
  Object.defineProperty(globalThis, "Notification", {
    writable: true,
    configurable: true,
    value: Object.assign(mockNotification, { permission: "granted" }),
  });

  // Remove serviceWorker so tests use the Notification fallback
  Object.defineProperty(navigator, "serviceWorker", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mockNotification.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useNotificationScheduler", () => {
  describe("guards", () => {
    it("schedules no timers when notifications are disabled", () => {
      ENABLED = false;
      renderHook(() => useNotificationScheduler());
      vi.runAllTimers();
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("schedules no timers when Notification API is unavailable", () => {
      Object.defineProperty(globalThis, "Notification", {
        writable: true,
        configurable: true,
        value: undefined,
      });
      renderHook(() => useNotificationScheduler());
      vi.runAllTimers();
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("schedules no timers when permission is not granted", () => {
      Object.defineProperty(globalThis, "Notification", {
        writable: true,
        configurable: true,
        value: Object.assign(mockNotification, { permission: "denied" }),
      });
      renderHook(() => useNotificationScheduler());
      vi.runAllTimers();
      expect(mockNotification).not.toHaveBeenCalled();
    });
  });

  describe("morning planning reminder", () => {
    it("fires at the configured morning time", () => {
      MORNING_TIME = "09:00";
      renderHook(() => useNotificationScheduler());

      const delay = msUntilTime("09:00");
      vi.advanceTimersByTime(delay - 1);
      expect(mockNotification).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockNotification).toHaveBeenCalledWith(
        expect.stringContaining("Good morning"),
        expect.objectContaining({ data: { action: "morning" } })
      );
    });

    it("includes today task count in body when today tasks exist", () => {
      TASKS = [makeTask({ today: true, completed: false })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));

      const [, opts] = mockNotification.mock.calls[0];
      expect(opts.body).toMatch(/1 task/);
    });

    it("includes unclassified count when no today tasks", () => {
      TASKS = [makeTask({ quadrant: "unclassified", today: false })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));

      const [, opts] = mockNotification.mock.calls[0];
      expect(opts.body).toMatch(/classification/);
    });

    it("uses generic body when no today or unclassified tasks", () => {
      TASKS = [makeTask({ quadrant: "Q2", today: false })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));

      const [, opts] = mockNotification.mock.calls[0];
      expect(opts.body).toMatch(/morning planning/i);
    });

    it("does not fire twice in the same day", () => {
      const { unmount } = renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));
      expect(mockNotification).toHaveBeenCalledWith(
        expect.stringContaining("Good morning"),
        expect.anything()
      );
      unmount();

      // Re-render later the same day — morning is already marked, should not fire again
      mockNotification.mockClear();
      renderHook(() => useNotificationScheduler());
      // Advance only 1 second (still same day, next timer is 24h away)
      vi.advanceTimersByTime(1000);
      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("sends Chinese title when locale is zh", () => {
      LOCALE = "zh";
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));

      const [title] = mockNotification.mock.calls[0];
      expect(title).toContain("早安");
    });
  });

  describe("Q1 due task alert", () => {
    it("fires 30 min before morning time when Q1 tasks are due today", () => {
      MORNING_TIME = "09:00";
      // due: "today" literal — must be resolved via parseDueISO
      TASKS = [makeTask({ quadrant: "Q1", due: "today" })];

      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      expect(mockNotification).toHaveBeenCalledWith(
        expect.stringContaining("Due today"),
        expect.objectContaining({ data: { action: "due" } })
      );
    });

    it("fires when due is ISO date matching today", () => {
      TASKS = [makeTask({ quadrant: "Q1", due: "2026-06-21" })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      expect(mockNotification).toHaveBeenCalledOnce();
    });

    it("does not fire when no tasks match today's due date", () => {
      TASKS = [makeTask({ quadrant: "Q1", due: "2026-06-22" })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("does not fire when due tasks are completed", () => {
      TASKS = [makeTask({ quadrant: "Q1", due: "today", completed: true })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("shows plural message for multiple due tasks", () => {
      TASKS = [
        makeTask({ id: "t1", quadrant: "Q1", due: "today" }),
        makeTask({ id: "t2", quadrant: "Q1", due: "today" }),
      ];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      const [title] = mockNotification.mock.calls[0];
      expect(title).toMatch(/2 tasks due today/);
    });

    it("skips alert entirely when dueAlertsEnabled is false", () => {
      DUE_ALERTS = false;
      TASKS = [makeTask({ quadrant: "Q1", due: "today" })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30") + 1000);

      expect(mockNotification).not.toHaveBeenCalled();
    });

    it("also fires for today-flagged tasks regardless of quadrant", () => {
      TASKS = [makeTask({ quadrant: "Q3", today: true, due: "today" })];
      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("08:30"));

      expect(mockNotification).toHaveBeenCalledOnce();
    });
  });

  describe("evening review reminder", () => {
    // Helper: advance to 18:00 and return the evening notification call args
    function advanceToEvening() {
      vi.advanceTimersByTime(msUntilTime("18:00"));
      // Evening fires last; find its call by data.action
      const call = mockNotification.mock.calls.find(([, o]) => o?.data?.action === "evening");
      return call ? (call as [string, NotificationOptions & { data: { action: string } }]) : null;
    }

    it("fires at the configured evening time", () => {
      EVENING_TIME = "18:00";
      renderHook(() => useNotificationScheduler());
      const call = advanceToEvening();

      expect(call).not.toBeNull();
      expect(call![0]).toContain("How was your day");
    });

    it("shows no completions message when nothing done today", () => {
      COMPLETED = [];
      renderHook(() => useNotificationScheduler());
      const call = advanceToEvening();

      expect(call![1].body).toMatch(/No completions today/);
    });

    it("shows task count and focused time when completed entries exist", () => {
      COMPLETED = [{ completedAt: "2026-06-21T10:00:00Z", duration: 90 }];
      renderHook(() => useNotificationScheduler());
      const call = advanceToEvening();

      expect(call![1].body).toMatch(/Completed 1 task/);
      expect(call![1].body).toMatch(/1h 30min/);
    });

    it("sends Chinese body when locale is zh", () => {
      LOCALE = "zh";
      COMPLETED = [{ completedAt: "2026-06-21T10:00:00Z", duration: 60 }];
      renderHook(() => useNotificationScheduler());
      const call = advanceToEvening();

      expect(call![1].body).toContain("完成了");
    });

    it("does not fire twice in the same day", () => {
      const { unmount } = renderHook(() => useNotificationScheduler());
      advanceToEvening();
      const eveningCount = mockNotification.mock.calls.filter(
        ([, o]) => o?.data?.action === "evening"
      ).length;
      expect(eveningCount).toBe(1);
      unmount();

      mockNotification.mockClear();
      renderHook(() => useNotificationScheduler());
      // Advance 1 second — still same day, next evening timer is 24h away
      vi.advanceTimersByTime(1000);
      expect(
        mockNotification.mock.calls.filter(([, o]) => o?.data?.action === "evening")
      ).toHaveLength(0);
    });
  });

  describe("per-task reminders", () => {
    const reminderCalls = () =>
      mockNotification.mock.calls.filter(([title]) => String(title).includes("Reminder"));

    it("fires a reminder at the task's remind_at time", () => {
      // Frozen now is 07:00; remind at 08:00 (before the 08:30 due-alert).
      TASKS = [makeTask({ remind_at: "2026-06-21T08:00" })];
      renderHook(() => useNotificationScheduler());

      vi.advanceTimersByTime(60 * 60 * 1000 - 1);
      expect(reminderCalls()).toHaveLength(0);

      vi.advanceTimersByTime(1);
      expect(reminderCalls()).toHaveLength(1);
      expect(reminderCalls()[0][0]).toContain("Task A");
    });

    it("fires immediately (catch-up) for a remind_at already in the past", () => {
      TASKS = [makeTask({ remind_at: "2026-06-21T06:00" })]; // 1h before frozen now
      renderHook(() => useNotificationScheduler());
      // No timer advance: a past-due reminder fires synchronously on mount.
      expect(reminderCalls()).toHaveLength(1);
    });

    it("does not fire for a completed task", () => {
      TASKS = [makeTask({ remind_at: "2026-06-21T06:00", completed: true })];
      renderHook(() => useNotificationScheduler());
      expect(reminderCalls()).toHaveLength(0);
    });

    it("does not fire twice for the same remind_at (dedup)", () => {
      TASKS = [makeTask({ remind_at: "2026-06-21T06:00" })];
      const { unmount } = renderHook(() => useNotificationScheduler());
      expect(reminderCalls()).toHaveLength(1);
      unmount();

      renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(1000);
      expect(reminderCalls()).toHaveLength(1); // still one — dedup key persists
    });

    it("uses the Chinese reminder title when locale is zh", () => {
      LOCALE = "zh";
      TASKS = [makeTask({ remind_at: "2026-06-21T06:00" })];
      renderHook(() => useNotificationScheduler());
      const zhCall = mockNotification.mock.calls.find(([t]) => String(t).includes("提醒"));
      expect(zhCall).toBeTruthy();
    });
  });

  describe("cleanup", () => {
    it("clears scheduled timers on unmount", () => {
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const { unmount } = renderHook(() => useNotificationScheduler());
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    });

    it("re-schedules when enabled changes from false to true", () => {
      ENABLED = false;
      const { rerender } = renderHook(() => useNotificationScheduler());
      vi.advanceTimersByTime(msUntilTime("09:00"));
      expect(mockNotification).not.toHaveBeenCalled();

      ENABLED = true;
      rerender();
      vi.advanceTimersByTime(msUntilTime("09:00"));
      expect(mockNotification).toHaveBeenCalled();
    });
  });
});
