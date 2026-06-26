import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCountdownStore } from "../useCountdownStore";

const UID = "user_test_1";

function mockFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  } as Response;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

type TestEvent = {
  id: string;
  title: string;
  date: string;
  color: "green" | "cyan" | "amber" | "red";
  repeat: "none" | "yearly";
  calendar: "solar" | "lunar";
  createdAt: string;
};

function makeEvent(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    id: "cd_test1",
    title: "My Birthday",
    date: "2026-08-14",
    color: "amber",
    repeat: "yearly",
    calendar: "solar",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useCountdownStore.setState({ events: [] });
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCountdownStore", () => {
  it("load returns empty array for local (unauthenticated) user", async () => {
    await useCountdownStore.getState().load("local");
    expect(useCountdownStore.getState().events).toEqual([]);
  });

  it("load fetches events from server and sets state", async () => {
    const serverEvents = [makeEvent()];
    // Migration already done — only GET /countdowns is called
    mockFetch(200, serverEvents);
    localStorage.setItem("lumo.countdowns.migrated.v1." + UID, "1");

    await useCountdownStore.getState().load(UID);
    expect(useCountdownStore.getState().events).toHaveLength(1);
    expect(useCountdownStore.getState().events[0].title).toBe("My Birthday");
  });

  it("load performs one-time migration of localStorage data", async () => {
    const oldEvent = makeEvent({ id: "cd_old1" });
    localStorage.setItem(`lumo.countdowns.v1.${UID}`, JSON.stringify([oldEvent]));
    // No migration flag set

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, migrated: 1 }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [oldEvent] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useCountdownStore.getState().load(UID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("lumo.countdowns.migrated.v1." + UID)).toBe("1");
    expect(localStorage.getItem(`lumo.countdowns.v1.${UID}`)).toBeNull();
  });

  it("load retains localStorage data when migration fails", async () => {
    const oldEvent = makeEvent({ id: "cd_old1" });
    localStorage.setItem(`lumo.countdowns.v1.${UID}`, JSON.stringify([oldEvent]));

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useCountdownStore.getState().load(UID);

    // Migration flag NOT set; old data still in localStorage
    expect(localStorage.getItem("lumo.countdowns.migrated.v1." + UID)).toBeNull();
    expect(localStorage.getItem(`lumo.countdowns.v1.${UID}`)).not.toBeNull();
  });

  it("load surfaces un-migrated local data when migration permanently fails and the server is empty", async () => {
    localStorage.setItem(`lumo.countdowns.v1.${UID}`, JSON.stringify([makeEvent({ id: "cd_local1" })]));

    const fetchMock = vi.fn()
      // POST /countdowns/migrate rejects (e.g. permanent 4xx)
      .mockRejectedValueOnce(new Error("400 bad request"))
      // GET /countdowns — server has nothing yet
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useCountdownStore.getState().load(UID);

    expect(useCountdownStore.getState().events).toHaveLength(1);
    expect(useCountdownStore.getState().events[0].id).toBe("cd_local1");
  });

  it("load skips the migrate request entirely when there is no local data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useCountdownStore.getState().load(UID);

    // No POST /countdowns/migrate — only the single GET
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("lumo.countdowns.migrated.v1." + UID)).toBe("1");
  });

  it("create calls POST /countdowns and adds event to state", async () => {
    const created = makeEvent();
    mockFetch(201, created);

    const event = await useCountdownStore.getState().create(UID, {
      title: "My Birthday",
      date: "2026-08-14",
      color: "amber",
      repeat: "yearly",
    });

    expect(useCountdownStore.getState().events).toHaveLength(1);
    expect(event.title).toBe("My Birthday");
  });

  it("update calls PATCH /countdowns/:id and updates state", async () => {
    const original = makeEvent();
    useCountdownStore.setState({ events: [original] });

    const updated = { ...original, title: "New Title" };
    mockFetch(200, updated);

    await useCountdownStore.getState().update(UID, original.id, { title: "New Title" });

    expect(useCountdownStore.getState().events[0].title).toBe("New Title");
  });

  it("remove calls DELETE /countdowns/:id and removes event from state", async () => {
    const event = makeEvent();
    useCountdownStore.setState({ events: [event] });
    mockFetch(204, null);

    await useCountdownStore.getState().remove(UID, event.id);

    expect(useCountdownStore.getState().events).toHaveLength(0);
  });

  it("clear empties events without API call", () => {
    useCountdownStore.setState({ events: [makeEvent()] });
    useCountdownStore.getState().clear();
    expect(useCountdownStore.getState().events).toEqual([]);
  });

  it("shows error toast and does not update state when create fails", async () => {
    mockFetch(500, { error: { code: "INTERNAL_ERROR", message: "fail" } });
    useCountdownStore.setState({ events: [] });
    localStorage.setItem("lumo.token", "test-token");

    await expect(
      useCountdownStore.getState().create(UID, {
        title: "Bad",
        date: "2026-08-14",
        color: "red",
        repeat: "none",
      })
    ).rejects.toThrow();

    expect(useCountdownStore.getState().events).toHaveLength(0);
  });
});
