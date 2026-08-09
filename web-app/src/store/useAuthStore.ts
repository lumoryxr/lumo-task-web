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
import type { DataExportWire } from "@lumo/contracts";
import { presentError, detailOf } from "@/lib/presentError";
import { useAIStore } from "@/store/useAIStore";
import { useAppStore } from "@/store/useAppStore";

const LOCAL_USER: User = {
  id: "local",
  name: "You",
  username: "",
  email: null,
  initials: "YO",
  local: true,
  emailVerified: true,
  plan: "free",
  stats: { tasks: 0, pomodoros: 0, syncOK: false },
};

interface AuthState {
  user: User;
  loading: boolean;
  error: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signInWithProvider: (provider: "google" | "apple" | "github") => Promise<void>;
  /** Register a username-only account; resolves with the one-time recovery code. */
  register: (input: { username: string; password: string; confirm: string }) => Promise<string>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Request a password-reset link (enumeration-safe — resolves for any email). */
  forgotPassword: (email: string) => Promise<void>;
  /** Complete a password reset with the token from the emailed link. */
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  /** Reset a password with a recovery code — the universal offline fallback. */
  recoveryReset: (input: { username: string; code: string; newPassword: string }) => Promise<void>;
  /** Bind (or change) the account email; goes through the verification flow. */
  bindEmail: (email: string) => Promise<void>;
  /** Regenerate the account recovery code; resolves with the new plaintext (once). */
  regenerateRecoveryCode: () => Promise<string>;
  /** Confirm the account email with the token from the verification link. */
  verifyEmail: (token: string) => Promise<void>;
  /** Re-send the verification email for the signed-in user. */
  resendVerification: () => Promise<void>;
  /** Re-fetch the signed-in user (e.g. to pick up a freshly-verified email). */
  refreshUser: () => Promise<void>;
  /** GDPR/CCPA export — returns the caller's full data bundle for download. */
  exportData: () => Promise<DataExportWire>;
  /** Irreversibly delete the account, then drop to a clean signed-out state. */
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Force-logout without an API call — used when the server returns 401 (session expired). */
  forceSignOut: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: LOCAL_USER,
      loading: false,
      error: null,

      async signIn(username, password) {
        set({ loading: true, error: null });
        try {
          const user = await api.signIn({ username, password });
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
          const { user, recoveryCode } = await api.register(input);
          // The user picked appearance/language during onboarding, before this
          // account existed. Adopt those local choices into the new account so
          // the sign-in hydration (loadAppearance) doesn't reset them to server
          // defaults. Best-effort — never block account creation on it.
          const { locale, accent, density, reducedMotion } = useAppStore.getState();
          await api
            .patchSettings({ locale, accent, density, reduced_motion: reducedMotion })
            .catch(() => {});
          set({ user, loading: false });
          // Surface the one-time recovery code so the page can present it before
          // routing on. It is never persisted or re-fetchable.
          return recoveryCode;
        } catch (e) {
          // The form owns presentation — see signIn.
          set({ loading: false, error: detailOf(e) });
          throw e;
        }
      },

      async changePassword(currentPassword, newPassword) {
        // The page owns presentation (inline error for a wrong current password,
        // toast otherwise), so we only do the work + re-auth and rethrow.
        const username = get().user.username ?? "";
        await api.changePassword({
          current_password: currentPassword,
          new_password: newPassword,
        });
        // A successful change bumps the account's session_version on the server,
        // invalidating every previously-issued token — INCLUDING this session's
        // access + refresh tokens. Re-authenticate with the new password to mint
        // fresh tokens so the user stays signed in, rather than being silently
        // 401'd out on their very next request.
        try {
          const user = await api.signIn({ username, password: newPassword });
          set({ user });
        } catch (e) {
          // The password DID change, but re-auth failed (network/rate-limit). The
          // old session is already dead — drop to a clean signed-out state so the
          // next step is an explicit re-login with the new password.
          get().forceSignOut();
          throw e;
        }
      },

      async forgotPassword(email) {
        // Passthrough — the page owns presentation. Resolves identically for any
        // email (the backend never reveals whether an account exists).
        await api.forgotPassword(email);
      },

      async resetPassword(token, newPassword) {
        // Passthrough — the page owns presentation (inline invalid-token message
        // vs. toast). No local session to update; the user re-logs in after.
        await api.resetPassword({ token, new_password: newPassword });
      },

      async recoveryReset({ username, code, newPassword }) {
        // Passthrough — the page owns presentation (inline invalid-code message
        // vs. toast). The recovery code is single-use; the user re-logs in after.
        await api.recoveryReset({ username, code, new_password: newPassword });
      },

      async bindEmail(email) {
        // The page owns presentation (inline EMAIL_TAKEN vs. toast). On success,
        // refresh the user so the account view reflects the newly-bound (still
        // unverified) email and the verify banner appears.
        await api.bindEmail(email);
        await get().refreshUser();
      },

      async regenerateRecoveryCode() {
        // Passthrough — returns the new one-time plaintext for the page to show.
        return api.regenerateRecoveryCode();
      },

      async verifyEmail(token) {
        // Passthrough — the page owns presentation. On success the caller
        // refreshes the user so the "verify your email" banner clears.
        await api.verifyEmail(token);
      },

      async resendVerification() {
        await api.resendVerification();
      },

      async refreshUser() {
        if (get().user.local) return;
        try {
          const user = await api.getUser();
          set({ user });
        } catch {
          // Best-effort — a failed refresh shouldn't disrupt the current view.
        }
      },

      async exportData() {
        // Read-through to the API. The page owns presentation (busy state +
        // success/error toast) and the file download.
        return api.exportData();
      },

      async deleteAccount() {
        // Wipe all user-specific client state BEFORE and after the call, the
        // same way signOut does, so nothing survives the erasure locally.
        useAIStore.getState().closeChat();
        useAIStore.getState().clearHistory();
        useAIStore.persist.clearStorage();
        await api.deleteAccount();
        set({ user: LOCAL_USER, loading: false, error: null });
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
