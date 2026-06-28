import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useDragSettleStore, DRAG_SETTLE_MS } from "../useDragSettleStore";

describe("useDragSettleStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDragSettleStore.getState().clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags the settled id and auto-clears after the settle window", () => {
    useDragSettleStore.getState().settle("t_1");
    expect(useDragSettleStore.getState().settleId).toBe("t_1");

    vi.advanceTimersByTime(DRAG_SETTLE_MS - 1);
    expect(useDragSettleStore.getState().settleId).toBe("t_1");

    vi.advanceTimersByTime(1);
    expect(useDragSettleStore.getState().settleId).toBeNull();
  });

  it("a second settle resets the timer and replaces the id", () => {
    useDragSettleStore.getState().settle("t_1");
    vi.advanceTimersByTime(DRAG_SETTLE_MS - 50);

    // Re-settle with a new id before the first window elapses.
    useDragSettleStore.getState().settle("t_2");
    expect(useDragSettleStore.getState().settleId).toBe("t_2");

    // The original timer must NOT fire and clear the new id.
    vi.advanceTimersByTime(50);
    expect(useDragSettleStore.getState().settleId).toBe("t_2");

    // The new timer clears it on its own schedule.
    vi.advanceTimersByTime(DRAG_SETTLE_MS - 50);
    expect(useDragSettleStore.getState().settleId).toBeNull();
  });

  it("clear() cancels a pending auto-clear", () => {
    useDragSettleStore.getState().settle("t_1");
    useDragSettleStore.getState().clear();
    expect(useDragSettleStore.getState().settleId).toBeNull();

    // No lingering timer should resurrect or re-clear unexpectedly.
    vi.advanceTimersByTime(DRAG_SETTLE_MS * 2);
    expect(useDragSettleStore.getState().settleId).toBeNull();
  });
});
