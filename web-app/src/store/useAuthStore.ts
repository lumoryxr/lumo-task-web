/**
 * Auth store — current user + sign-in / sign-out actions.
 *
 * The user is persisted to localStorage so the "signed in" state
 * survives reload. Token-based real auth would store the token here too
 * and replay it via `src/api/client.ts`.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/api/client";
import type { User } from "@/types/task";
import { presentError, detailOf } from "@/lib/presentError";
import { useAIStore } from "@/store/useAIStore";

const LOCAL_USER: User = {
  id: "local",
  name: "You",
  email: "",
  initials: "YO",
  local: true,
  plan: "free",
  stats: { tasks: 0, pomodoros: 0, syncOK: false },
};

interface AuthState {
  user: User;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: "google" | "apple" | "github") => Promise<void>;
  register: (input: { email: string; password: string; confirm: string; nickname?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Force-logout without an API call — used when the server returns 401 (session expired). */
  forceSignOut: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: LOCAL_USER,
      loading: false,
      error: null,

      async signIn(email, password) {
        set({ loading: true, error: null });
        try {
          const user = await api.signIn({ email, password });
          set({ user, loading: false });
        } catch (e) {
          // The form owns presentation (inline field errors + toast fallback) so
          // validation detail lands under the right input; just record + rethrow.
          set({ loading: false, error: detailOf(e) });
          throw e;
        }
      },

      async signInWithProvider(provider) {
        set({ loading: true, error: null });
        try {
          const user = await api.signInWithProvider(provider);
          set({ user, loading: false });
        } catch (e) {
          // No form fields involved — surface directly through the unified path.
          set({ loading: false, error: detailOf(e) });
          presentError(e, "error.auth.signin");
          throw e;
        }
      },

      async register(input) {
        set({ loading: true, error: null });
        try {
          const user = await api.register(input);
          set({ user, loading: false });
        } catch (e) {
          // The form owns presentation — see signIn.
          set({ loading: false, error: detailOf(e) });
          throw e;
        }
      },

      async signOut() {
        // Clear all user-specific client data BEFORE the network call so
        // it cannot be read even if the request hangs or fails.
        useAIStore.getState().closeChat();
        useAIStore.getState().clearHistory();
        useAIStore.persist.clearStorage(); // wipe lumo-ai from localStorage

        set({ loading: true, error: null });
        try {
          const user = await api.signOut();
          set({ user, loading: false });
        } catch (e) {
          set({ user: LOCAL_USER, loading: false });
          presentError(e, "error.auth.signout");
        }
      },

      forceSignOut() {
        useAIStore.getState().closeChat();
        useAIStore.getState().clearHistory();
        useAIStore.persist.clearStorage();
        set({ user: LOCAL_USER, loading: false, error: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "lumo.auth.v1",
      // Only persist the user — loading/error are transient.
      partialize: (s) => ({ user: s.user }),
    }
  )
);

/** Convenience selector: is the user signed in (not the local stand-in)? */
export const selectIsSignedIn = (s: AuthState) => !s.user.local && s.user.id !== "local";
