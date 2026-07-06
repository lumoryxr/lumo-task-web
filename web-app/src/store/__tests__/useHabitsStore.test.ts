import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useHabitsStore } from "../useHabitsStore";

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

type TestHabit = {
  id: string;
  title: string;
  color: "green" | "cyan" | "amber" | "red" | "purple";
  frequency: "daily" | "weekdays" | "weekend" | "days_of_week" | "times_per_week" | "interval";
  createdAt: string;
};

function makeHabit(overrides: Partial<TestHabit> = {}): TestHabit {
  return {
    id: "habit_test1",
    title: "Morning run",
    color: "green",
    frequency: "daily",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useHabitsStore.setState({ habits: [], logs: [], hydrated: false });
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useHabitsStore", () => {
  it("load resets state for local (unauthenticated) user without any fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load("local");

    expect(useHabitsStore.getState().habits).toEqual([]);
    expect(useHabitsStore.getState().logs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not hydrated until the first load() settles (#207)", async () => {
    expect(useHabitsStore.getState().hydrated).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load("local");

    expect(useHabitsStore.getState().hydrated).toBe(true);
  });

  it("becomes hydrated even when the habits fetch fails (#207)", async () => {
    localStorage.setItem("lumo.habits.migrated.v1." + UID, "1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await useHabitsStore.getState().load(UID);

    expect(useHabitsStore.getState().hydrated).toBe(true);
  });

  it("clear() resets hydration so a fresh sign-in shows the skeleton again (#207)", async () => {
    useHabitsStore.setState({ hydrated: true });
    useHabitsStore.getState().clear();
    expect(useHabitsStore.getState().hydrated).toBe(false);
  });

  it("load fetches habits and logs when migration is already done", async () => {
    localStorage.setItem("lumo.habits.migrated.v1." + UID, "1");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [makeHabit()] } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ habitId: "habit_test1", date: "2026-01-02", completedAt: "2026-01-02T08:00:00.000Z" }],
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load(UID);

    expect(useHabitsStore.getState().habits).toHaveLength(1);
    expect(useHabitsStore.getState().habits[0].title).toBe("Morning run");
    expect(useHabitsStore.getState().logs).toHaveLength(1);
  });

  it("load performs one-time migration of localStorage data, then clears local keys", async () => {
    localStorage.setItem(`lumo.habits.v1.${UID}`, JSON.stringify([makeHabit({ id: "habit_old1" })]));
    localStorage.setItem(
      `lumo.habit-logs.v1.${UID}`,
      JSON.stringify([{ habitId: "habit_old1", date: "2026-01-02", completedAt: "2026-01-02T08:00:00.000Z" }]),
    );

    const fetchMock = vi.fn()
      // POST /habits/migrate
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)
      // GET /habits
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [makeHabit({ id: "habit_old1" })] } as Response)
      // GET /habits/logs
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load(UID);

    expect(localStorage.getItem("lumo.habits.migrated.v1." + UID)).toBe("1");
    expect(localStorage.getItem(`lumo.habits.v1.${UID}`)).toBeNull();
    expect(localStorage.getItem(`lumo.habit-logs.v1.${UID}`)).toBeNull();
  });

  it("load retains localStorage data when migration fails", async () => {
    localStorage.setItem(`lumo.habits.v1.${UID}`, JSON.stringify([makeHabit({ id: "habit_old1" })]));

    const fetchMock = vi.fn()
      // POST /habits/migrate rejects
      .mockRejectedValueOnce(new Error("network error"))
      // GET /habits
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
      // GET /habits/logs
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load(UID);

    // Flag NOT set, old data preserved for the next retry
    expect(localStorage.getItem("lumo.habits.migrated.v1." + UID)).toBeNull();
    expect(localStorage.getItem(`lumo.habits.v1.${UID}`)).not.toBeNull();
  });

  it("load surfaces un-migrated local data when migration permanently fails and the server is empty", async () => {
    localStorage.setItem(`lumo.habits.v1.${UID}`, JSON.stringify([makeHabit({ id: "habit_local1" })]));

    const fetchMock = vi.fn()
      // POST /habits/migrate rejects (e.g. permanent 4xx)
      .mockRejectedValueOnce(new Error("400 bad request"))
      // GET /habits — server has nothing yet
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
      // GET /habits/logs
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load(UID);

    // Local data must remain visible rather than being replaced by an empty list
    expect(useHabitsStore.getState().habits).toHaveLength(1);
    expect(useHabitsStore.getState().habits[0].id).toBe("habit_local1");
  });

  it("load skips the migrate request entirely when there is no local data", async () => {
    const fetchMock = vi.fn()
      // GET /habits
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response)
      // GET /habits/logs
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await useHabitsStore.getState().load(UID);

    // No POST /habits/migrate — only the two GETs
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("lumo.habits.migrated.v1." + UID)).toBe("1");
  });

  it("create calls POST /habits and appends the habit to state", async () => {
    mockFetch(201, makeHabit());

    const habit = await useHabitsStore.getState().create(UID, {
      title: "Morning run",
      color: "green",
      frequency: "daily",
    });

    expect(useHabitsStore.getState().habits).toHaveLength(1);
    expect(habit.title).toBe("Morning run");
  });

  it("create rethrows and leaves state untouched when the API fails", async () => {
    mockFetch(500, { error: { code: "INTERNAL_ERROR", message: "fail" } });
    localStorage.setItem("lumo.token", "test-token");

    await expect(
      useHabitsStore.getState().create(UID, { title: "Bad", color: "red", frequency: "daily" }),
    ).rejects.toThrow();

    expect(useHabitsStore.getState().habits).toHaveLength(0);
  });

  it("update calls PATCH /habits/:id and updates the matching habit", async () => {
    const original = makeHabit();
    useHabitsStore.setState({ habits: [original], logs: [] });
    mockFetch(200, { ...original, title: "Evening run" });

    await useHabitsStore.getState().update(UID, original.id, { title: "Evening run" });

    expect(useHabitsStore.getState().habits[0].title).toBe("Evening run");
  });

  it("remove calls DELETE /habits/:id and drops the habit and its logs", async () => {
    const habit = makeHabit();
    useHabitsStore.setState({
      habits: [habit],
      logs: [{ habitId: habit.id, date: "2026-01-02", completedAt: "2026-01-02T08:00:00.000Z" }],
    });
    mockFetch(204, null);

    await useHabitsStore.getState().remove(UID, habit.id);

    expect(useHabitsStore.getState().habits).toHaveLength(0);
    expect(useHabitsStore.getState().logs).toHaveLength(0);
  });

  it("log calls POST /habits/:id/log and adds the entry once", async () => {
    const habit = makeHabit();
    useHabitsStore.setState({ habits: [habit], logs: [] });
    mockFetch(201, { habitId: habit.id, date: "2026-06-20", completedAt: "2026-06-20T08:00:00.000Z" });

    await useHabitsStore.getState().log(UID, habit.id, "2026-06-20");

    const logs = useHabitsStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].date).toBe("2026-06-20");
  });

  it("log does not duplicate an existing entry for the same habit and date", async () => {
    const habit = makeHabit();
    useHabitsStore.setState({
      habits: [habit],
      logs: [{ habitId: habit.id, date: "2026-06-20", completedAt: "2026-06-20T08:00:00.000Z" }],
    });
    mockFetch(201, { habitId: habit.id, date: "2026-06-20", completedAt: "2026-06-20T09:00:00.000Z" });

    await useHabitsStore.getState().log(UID, habit.id, "2026-06-20");

    expect(useHabitsStore.getState().logs).toHaveLength(1);
  });

  it("log rethrows and adds no entry when the API fails", async () => {
    const habit = makeHabit();
    useHabitsStore.setState({ habits: [habit], logs: [] });
    mockFetch(500, { error: { code: "INTERNAL_ERROR", message: "fail" } });

    // Rethrow lets the check-in modal keep itself open for a retry instead of
    // closing on a failed log (which would look like success to the user).
    await expect(
      useHabitsStore.getState().log(UID, habit.id, "2026-06-20"),
    ).rejects.toThrow();

    expect(useHabitsStore.getState().logs).toHaveLength(0);
  });

  it("unlog calls DELETE /habits/:id/log/:date and removes the entry", async () => {
    const habit = makeHabit();
    useHabitsStore.setState({
      habits: [habit],
      logs: [{ habitId: habit.id, date: "2026-06-20", completedAt: "2026-06-20T08:00:00.000Z" }],
    });
    mockFetch(204, null);

    await useHabitsStore.getState().unlog(UID, habit.id, "2026-06-20");

    expect(useHabitsStore.getState().logs).toHaveLength(0);
  });

  it("clear empties habits and logs without an API call", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useHabitsStore.setState({
      habits: [makeHabit()],
      logs: [{ habitId: "habit_test1", date: "2026-06-20", completedAt: "2026-06-20T08:00:00.000Z" }],
    });

    useHabitsStore.getState().clear();

    expect(useHabitsStore.getState().habits).toEqual([]);
    expect(useHabitsStore.getState().logs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
