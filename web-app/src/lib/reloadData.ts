/**
 * Re-hydrate every data store from the LOCAL backend.
 *
 * The desktop sync cycle (manual "Sync now", first reconcile on enable, and the
 * periodic engine in `useSyncEngine`) pulls cloud rows and writes them into the
 * local SQLite DB. Those rows are NOT visible in the UI until the in-memory
 * Zustand stores refetch — `App.tsx` only loads them once at sign-in. This helper
 * mirrors that sign-in load so callers can refresh the UI right after a pull.
 *
 * `userId` matches the signed-in user (`useAuthStore`); the habit/countdown
 * stores key their one-time localStorage migration on it and skip the "local"
 * placeholder, exactly like the App-level load.
 */
import { useTasksStore } from "@/store/useTasksStore";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useCountdownStore } from "@/store/useCountdownStore";
import { useHabitsStore } from "@/store/useHabitsStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useTemplatesStore } from "@/store/useTemplatesStore";

export async function reloadAllData(userId: string): Promise<void> {
  await Promise.all([
    useTasksStore.getState().load(),
    usePeopleStore.getState().load(),
    useCountdownStore.getState().load(userId),
    useHabitsStore.getState().load(userId),
    useNotificationStore.getState().load(),
    useTemplatesStore.getState().load(),
  ]);
}
