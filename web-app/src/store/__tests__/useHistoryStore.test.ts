import { describe, it, expect, vi, beforeEach } from "vitest";

const { listCompletedPage, reopen } = vi.hoisted(() => ({
  listCompletedPage: vi.fn(),
  reopen: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: { listCompletedPage } }));
vi.mock("@/store/useTasksStore", () => ({ useTasksStore: { getState: () => ({ reopen }) } }));
vi.mock("@/store/useToastStore", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/i18n/useT", () => ({ t: (k: string) => k }));

import { useHistoryStore } from "@/store/useHistoryStore";

const entry = (id: string) => ({ id, title: { en: id }, duration: 0, completedAt: "2026-11-20T10:00:00Z", subtasks: [] });

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.setState({ entries: [], nextCursor: null, loaded: false, loading: false, loadingMore: false, error: false });
});

describe("useHistoryStore", () => {
  it("loads the first page", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: [entry("a"), entry("b")], nextCursor: "c1" });
    await useHistoryStore.getState().load();
    const s = useHistoryStore.getState();
    expect(s.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(s.nextCursor).toBe("c1");
    expect(s.loaded).toBe(true);
    expect(listCompletedPage).toHaveBeenCalledWith(undefined, 50);
  });

  it("appends the next page with the cursor, and stops at the end", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: [entry("a")], nextCursor: "c1" });
    await useHistoryStore.getState().load();
    listCompletedPage.mockResolvedValueOnce({ entries: [entry("b")], nextCursor: null });
    await useHistoryStore.getState().loadMore();
    expect(listCompletedPage).toHaveBeenLastCalledWith("c1", 50);
    expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(["a", "b"]);
    await useHistoryStore.getState().loadMore();
    expect(listCompletedPage).toHaveBeenCalledTimes(2);
  });

  it("flags an error instead of throwing when loading fails", async () => {
    listCompletedPage.mockRejectedValueOnce(new Error("offline"));
    await useHistoryStore.getState().load();
    expect(useHistoryStore.getState().error).toBe(true);
    expect(useHistoryStore.getState().loading).toBe(false);
  });

  it("reopening an entry restores the task and drops it from history", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: [entry("a"), entry("b")], nextCursor: null });
    await useHistoryStore.getState().load();
    reopen.mockResolvedValueOnce(undefined);
    await useHistoryStore.getState().reopen("a");
    expect(reopen).toHaveBeenCalledWith("a");
    expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("keeps the entry when reopening fails", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: [entry("a")], nextCursor: null });
    await useHistoryStore.getState().load();
    reopen.mockRejectedValueOnce(new Error("nope"));
    await useHistoryStore.getState().reopen("a");
    expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(["a"]);
  });
});
