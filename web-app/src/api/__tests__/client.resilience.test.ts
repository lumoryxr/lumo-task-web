import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Builds a minimal Response-like object the client's `req` understands.
function makeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  } as Response;
}

const TASK_PAGE = { items: [], nextCursor: null };

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API client — request resilience (timeout / retry)", () => {
  it("AC1: aborts after the timeout and rejects with a timeout error", async () => {
    vi.useFakeTimers();
    // A fetch that never resolves on its own — only rejects when the signal aborts.
    const fetchMock = vi.fn(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            const e = new Error("The operation was aborted");
            (e as any).name = "AbortError";
            reject(e);
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.listTasks();
    const assertion = expect(p).rejects.toThrow(/超时|timed?\s*out/i);
    await vi.runAllTimersAsync();
    await assertion;
    // GET is idempotent → 1 initial + 2 retries, each timing out.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("AC2: retries an idempotent GET on a network error, then resolves on success", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls++;
      if (calls <= 2) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(makeRes(200, TASK_PAGE));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.listTasks();
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it("AC2: retries an idempotent GET on a 503, then resolves on success", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls++;
      if (calls <= 2) return Promise.resolve(makeRes(503, { error: "unavailable" }));
      return Promise.resolve(makeRes(200, TASK_PAGE));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.listTasks();
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it("AC2: gives up after exhausting retries on persistent 503", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(makeRes(503, { error: "unavailable" })));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.listTasks();
    const assertion = expect(p).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("AC3: does NOT retry a non-idempotent write (POST) on a network error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.createTask({
      title: "x",
      quadrant: "q1",
      today: false,
      duration: 25,
      pomos_total: 1,
    } as any);
    const assertion = expect(p).rejects.toThrow(/无法连接|connect/i);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1); // never retried
  });

  it("AC3: does NOT retry a GET on a non-retryable status (500)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(makeRes(500, { error: "boom" })));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const p = api.listTasks();
    const assertion = expect(p).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1); // 500 is not transient → no retry
  });

  it("AC4: a clean GET still resolves normally with no retries", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(makeRes(200, TASK_PAGE)));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    await expect(api.listTasks()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
