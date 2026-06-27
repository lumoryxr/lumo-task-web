import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ─── Mutable mock state ──────────────────────────────────────────────────────
let SIGNED_IN = true;
let USER_ID = "user-1";
let ENABLED = true;
let PULLED = 0;

const syncStatus = vi.fn(async () => ({ enabled: ENABLED }));
const syncNow = vi.fn(async () => ({ pushed: 0, pulled: PULLED }));
const reloadAllData = vi.fn(async (_userId: string) => {});

vi.mock("@/api/client", () => ({
  api: {
    syncStatus: () => syncStatus(),
    syncNow: () => syncNow(),
  },
}));

vi.mock("@/lib/reloadData", () => ({
  reloadAllData: (userId: string) => reloadAllData(userId),
}));

vi.mock("@/store/useAuthStore", () => ({
  // Both `useAuthStore(selectIsSignedIn)` and `useAuthStore((s) => s.user.id)`
  // route through this — the selector is applied to a synthetic state.
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) =>
    sel({ user: { id: USER_ID } }),
  selectIsSignedIn: () => SIGNED_IN,
}));

import { useSyncEngine } from "../useSyncEngine";

function setElectron(on: boolean) {
  if (on) (window as unknown as { electronAPI?: unknown }).electronAPI = { isElectron: true };
  else delete (window as unknown as { electronAPI?: unknown }).electronAPI;
}

beforeEach(() => {
  vi.useFakeTimers();
  SIGNED_IN = true;
  USER_ID = "user-1";
  ENABLED = true;
  PULLED = 0;
  syncStatus.mockClear();
  syncNow.mockClear();
  reloadAllData.mockClear();
  setElectron(true);
});

afterEach(() => {
  vi.useRealTimers();
  setElectron(false);
});

describe("useSyncEngine", () => {
  it("re-hydrates the data stores when a cycle pulls cloud rows (the bug: pulled rows were invisible)", async () => {
    PULLED = 3;
    renderHook(() => useSyncEngine());

    await vi.advanceTimersByTimeAsync(30_000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(reloadAllData).toHaveBeenCalledTimes(1);
    expect(reloadAllData).toHaveBeenCalledWith("user-1");
  });

  it("does NOT re-hydrate when the cycle pulled nothing (avoids needless refetch/flicker)", async () => {
    PULLED = 0;
    renderHook(() => useSyncEngine());

    await vi.advanceTimersByTimeAsync(30_000);

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(reloadAllData).not.toHaveBeenCalled();
  });

  it("does not sync while sync is disabled (status gate)", async () => {
    ENABLED = false;
    PULLED = 5;
    renderHook(() => useSyncEngine());

    await vi.advanceTimersByTimeAsync(30_000);

    expect(syncStatus).toHaveBeenCalledTimes(1);
    expect(syncNow).not.toHaveBeenCalled();
    expect(reloadAllData).not.toHaveBeenCalled();
  });

  it("is a no-op while signed out", async () => {
    SIGNED_IN = false;
    PULLED = 5;
    renderHook(() => useSyncEngine());

    await vi.advanceTimersByTimeAsync(30_000);

    expect(syncStatus).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("is a no-op off the desktop (no electron bridge)", async () => {
    setElectron(false);
    PULLED = 5;
    renderHook(() => useSyncEngine());

    await vi.advanceTimersByTimeAsync(30_000);

    expect(syncStatus).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it("stops syncing after unmount", async () => {
    PULLED = 1;
    const { unmount } = renderHook(() => useSyncEngine());
    unmount();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(syncNow).not.toHaveBeenCalled();
  });
});
