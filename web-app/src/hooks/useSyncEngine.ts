/**
 * Desktop two-way sync engine (renderer-driven).
 *
 * The renderer owns the sync cadence so the UI always reflects pulled cloud rows.
 * Every interval, if sync is enabled, it runs one push-then-pull cycle and — when
 * that cycle pulled anything — re-hydrates the data stores so the new rows show up
 * without an app restart.
 *
 * Why the renderer drives it (not a backend timer): a backend loop advanced the
 * pull cursor without the renderer knowing, so pulled cloud changes silently sat
 * in SQLite and never appeared in the UI. Driving from here keeps "pulled rows"
 * and "refresh the UI" in the same place.
 *
 * No-op off the desktop (web has no local sync binding) and while signed out.
 */
import { useEffect, useRef } from "react";
import { api } from "@/api/client";
import { useAuthStore, selectIsSignedIn } from "@/store/useAuthStore";
import { reloadAllData } from "@/lib/reloadData";

const SYNC_INTERVAL_MS = 30_000;

export function useSyncEngine(): void {
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const userId = useAuthStore((s) => s.user.id);
  // Guards against overlapping cycles if one tick runs long (network stall).
  const runningRef = useRef(false);

  useEffect(() => {
    const isElectron = typeof window !== "undefined" && !!window.electronAPI;
    if (!isElectron || !isSignedIn) return;
    let cancelled = false;

    async function tick() {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const status = await api.syncStatus();
        if (cancelled || !status.enabled) return;
        const res = await api.syncNow();
        if (!cancelled && res.pulled > 0) {
          await reloadAllData(userId);
        }
      } catch {
        // Background cycle: failures are recorded server-side (surfaced as
        // last_error in Settings). Stay silent and retry on the next tick.
      } finally {
        runningRef.current = false;
      }
    }

    const timer = setInterval(tick, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isSignedIn, userId]);
}
