import { describe, it, expect, beforeEach, vi } from "vitest";
import { drainDelta, getCursor, setCursor, startSyncEngine } from "../syncEngine";
import { api } from "@/api/client";

type Page = {
  cursor: number;
  hasMore: boolean;
  changes: Partial<Record<"tasks" | "completed" | "people" | "habits" | "countdowns", any[]>>;
};

function page(p: Page) {
  return {
    cursor: p.cursor,
    hasMore: p.hasMore,
    changes: {
      tasks: p.changes.tasks ?? [],
      completed: p.changes.completed ?? [],
      people: p.changes.people ?? [],
      habits: p.changes.habits ?? [],
      countdowns: p.changes.countdowns ?? [],
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("syncEngine · cursor helpers", () => {
  it("namespaces the cursor per user", () => {
    setCursor("u1", 10);
    setCursor("u2", 20);
    expect(getCursor("u1")).toBe(10);
    expect(getCursor("u2")).toBe(20);
    expect(getCursor("u3")).toBe(null);
  });
});

describe("syncEngine · drainDelta", () => {
  it("advances the cursor and reports changed domains", async () => {
    setCursor("u1", 5);
    vi.spyOn(api, "syncDelta").mockResolvedValueOnce(
      page({ cursor: 9, hasMore: false, changes: { tasks: [{ id: "t1" }], people: [{ id: "p1" }] } }),
    );
    const changed = await drainDelta("u1");
    expect(getCursor("u1")).toBe(9);
    expect([...changed].sort()).toEqual(["people", "tasks"]);
  });

  it("paginates until hasMore is false, ending at the final cursor", async () => {
    const spy = vi.spyOn(api, "syncDelta")
      .mockResolvedValueOnce(page({ cursor: 3, hasMore: true, changes: { tasks: [{ id: "a" }] } }))
      .mockResolvedValueOnce(page({ cursor: 7, hasMore: true, changes: { habits: [{ id: "h" }] } }))
      .mockResolvedValueOnce(page({ cursor: 9, hasMore: false, changes: {} }));
    const changed = await drainDelta("u1");
    expect(spy).toHaveBeenCalledTimes(3);
    expect(getCursor("u1")).toBe(9);
    expect([...changed].sort()).toEqual(["habits", "tasks"]);
  });

  it("starts from 0 when no cursor is stored", async () => {
    const spy = vi.spyOn(api, "syncDelta").mockResolvedValueOnce(page({ cursor: 4, hasMore: false, changes: {} }));
    await drainDelta("u1");
    expect(spy).toHaveBeenCalledWith(0);
    expect(getCursor("u1")).toBe(4);
  });
});

describe("syncEngine · startSyncEngine baseline gating", () => {
  it("baselines on first run without signalling, then signals on later changes", async () => {
    const onChanges = vi.fn();
    const spy = vi.spyOn(api, "syncDelta")
      // initial baseline drain (no cursor yet) → has a change but must NOT signal
      .mockResolvedValueOnce(page({ cursor: 100, hasMore: false, changes: { tasks: [{ id: "x" }] } }));

    const engine = startSyncEngine("u1", onChanges, { intervalMs: 1_000_000 });
    await flush(); // let the auto-kicked baseline poll settle
    expect(getCursor("u1")).toBe(100);
    expect(onChanges).not.toHaveBeenCalled(); // baseline must not trigger a refresh

    // next poll: a real cross-device change → must signal
    spy.mockResolvedValueOnce(page({ cursor: 105, hasMore: false, changes: { people: [{ id: "p" }] } }));
    await engine.poll();
    expect(onChanges).toHaveBeenCalledTimes(1);
    expect([...onChanges.mock.calls[0][0]]).toEqual(["people"]);

    // a poll with no changes → no signal
    spy.mockResolvedValueOnce(page({ cursor: 105, hasMore: false, changes: {} }));
    await engine.poll();
    expect(onChanges).toHaveBeenCalledTimes(1);

    engine.stop();
  });

  it("swallows network errors (read-only signal) without throwing", async () => {
    setCursor("u1", 1);
    const onChanges = vi.fn();
    vi.spyOn(api, "syncDelta").mockRejectedValueOnce(new Error("offline"));
    const engine = startSyncEngine("u1", onChanges, { intervalMs: 1_000_000 });
    await engine.poll();
    expect(onChanges).not.toHaveBeenCalled();
    engine.stop();
  });
});
