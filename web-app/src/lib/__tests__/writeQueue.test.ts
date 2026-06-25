import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, list, pendingCount, flush, startFlusher, withOfflineQueue, type QueuedWrite, type Executor } from "../writeQueue";

function w(key: string, path = "/tasks"): QueuedWrite {
  return { key, method: "POST", path, body: { x: 1 }, ts: 0 };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("writeQueue · enqueue / list", () => {
  it("persists per user and dedupes by idempotency key", () => {
    enqueue("u1", w("a"));
    enqueue("u1", w("a")); // duplicate key → ignored
    enqueue("u1", w("b"));
    enqueue("u2", w("a"));
    expect(list("u1").map((i) => i.key)).toEqual(["a", "b"]);
    expect(pendingCount("u2")).toBe(1);
  });
});

describe("writeQueue · flush", () => {
  it("replays FIFO and removes successful items", async () => {
    enqueue("u1", w("a"));
    enqueue("u1", w("b"));
    const seen: string[] = [];
    const exec: Executor = async (it) => { seen.push(it.key); return "ok"; };
    const res = await flush("u1", exec);
    expect(seen).toEqual(["a", "b"]);
    expect(res).toEqual({ flushed: 2, dropped: 0, remaining: 0 });
    expect(pendingCount("u1")).toBe(0);
  });

  it("stops at the first retry and preserves order (head kept)", async () => {
    enqueue("u1", w("a"));
    enqueue("u1", w("b"));
    enqueue("u1", w("c"));
    const exec: Executor = async (it) => (it.key === "b" ? "retry" : "ok");
    const res = await flush("u1", exec);
    expect(res.flushed).toBe(1); // a flushed, b retried → stop
    expect(list("u1").map((i) => i.key)).toEqual(["b", "c"]); // b kept at head
  });

  it("drops a permanently-rejected item so it can't wedge the queue", async () => {
    enqueue("u1", w("a"));
    enqueue("u1", w("b"));
    const exec: Executor = async (it) => (it.key === "a" ? "drop" : "ok");
    const res = await flush("u1", exec);
    expect(res).toEqual({ flushed: 1, dropped: 1, remaining: 0 });
    expect(pendingCount("u1")).toBe(0);
  });

  it("treats an executor throw as retry (network still down)", async () => {
    enqueue("u1", w("a"));
    const exec: Executor = async () => { throw new Error("offline"); };
    const res = await flush("u1", exec);
    expect(res.flushed).toBe(0);
    expect(pendingCount("u1")).toBe(1); // kept for later
  });
});

describe("writeQueue · withOfflineQueue", () => {
  const reqMeta = { key: "k1", method: "POST" as const, path: "/tasks", body: { a: 1 } };

  it("returns the online result and enqueues nothing on success", async () => {
    const optimistic = vi.fn();
    const r = await withOfflineQueue("u1", reqMeta, async () => "server", () => { optimistic(); return "opt"; });
    expect(r).toBe("server");
    expect(optimistic).not.toHaveBeenCalled();
    expect(pendingCount("u1")).toBe(0);
  });

  it("on an offline error: applies optimistic, enqueues, returns optimistic", async () => {
    const r = await withOfflineQueue(
      "u1",
      reqMeta,
      async () => { throw new Error("Failed to fetch"); },
      () => "opt",
    );
    expect(r).toBe("opt");
    expect(list("u1").map((i) => i.key)).toEqual(["k1"]);
  });

  it("rethrows a non-offline error and enqueues nothing", async () => {
    await expect(
      withOfflineQueue("u1", reqMeta, async () => { throw new Error("400 validation failed"); }, () => "opt"),
    ).rejects.toThrow(/validation/);
    expect(pendingCount("u1")).toBe(0);
  });
});

describe("writeQueue · startFlusher", () => {
  it("flushes pending items on start and on the online event", async () => {
    enqueue("u1", w("a"));
    let calls = 0;
    const exec: Executor = async () => { calls++; return "ok"; };
    const h = startFlusher("u1", { intervalMs: 1_000_000, exec });
    await new Promise((r) => setTimeout(r, 0)); // let the initial flush settle
    expect(calls).toBe(1);
    expect(pendingCount("u1")).toBe(0);

    // a later offline write + an 'online' event → flushes again
    enqueue("u1", w("b"));
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    h.stop();
  });
});
