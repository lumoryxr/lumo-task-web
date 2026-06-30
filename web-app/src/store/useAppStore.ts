/**
 * App-level UI state: route, language, theme, density, reduced motion.
 *
 * Task data lives in `useTasksStore.ts` to keep server-state and UI-state
 * separate.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, AppSettings } from "@/types/task";
import { api } from "@/api/client";

export type Accent = "green" | "cyan" | "amber" | "graphite";
export type Density = "comfortable" | "compact";
export type Route = "today" | "matrix" | "focus" | "settings";

const ACCENT_THEMES: Record<Accent, {
  primary: string; dim: string; glow: string; fog: string; edge: string;
}> = {
  green: {
    primary: "#3DFFA0", dim: "#1A7A4A",
    glow: "rgba(61, 255, 160, 0.25)", fog: "rgba(61, 255, 160, 0.10)", edge: "rgba(61, 255, 160, 0.50)",
  },
  cyan: {
    primary: "#38D4D4", dim: "#1F6E73",
    glow: "rgba(56, 212, 212, 0.25)", fog: "rgba(56, 212, 212, 0.10)", edge: "rgba(56, 212, 212, 0.50)",
  },
  amber: {
    primary: "#FFAA44", dim: "#9F6420",
    glow: "rgba(255, 170, 68, 0.22)", fog: "rgba(255, 170, 68, 0.10)", edge: "rgba(255, 170, 68, 0.50)",
  },
  graphite: {
    primary: "#A0ADB0", dim: "#52605E",
    glow: "rgba(160, 173, 176, 0.20)", fog: "rgba(160, 173, 176, 0.10)", edge: "rgba(160, 173, 176, 0.40)",
  },
};

export function applyAccentTheme(accent: Accent) {
  const t = ACCENT_THEMES[accent];
  const r = document.documentElement;
  r.style.setProperty("--accent-primary", t.primary);
  r.style.setProperty("--accent-dim", t.dim);
  r.style.setProperty("--accent-glow", t.glow);
  r.style.setProperty("--accent-fog", t.fog);
  r.style.setProperty("--accent-edge", t.edge);
}

export type MatrixView = "matrix" | "calendar";

// Appearance/language prefs live in the backend `settings` table too, so they
// follow a signed-in account across devices. We persist on change and hydrate
// on sign-in (see loadAppearance). The push is gated on a token: during
// onboarding the user picks a theme/language while NOT yet signed in (no token)
// — those choices stay in localStorage and are adopted into the new account by
// useAuthStore.register. This keeps every call site (Settings, Onboarding, …)
// correct without each having to know the auth state.
function persistAppearance(patch: {
  locale?: Locale;
  accent?: Accent;
  density?: Density;
  reduced_motion?: boolean;
}) {
  if (!localStorage.getItem("lumo.token")) return; // local mode → localStorage only
  // Best-effort: the change already applied + persisted locally, so a transient
  // network failure must never revert the user's visible theme.
  api.patchSettings(patch).catch(() => {});
}

interface AppState {
  locale: Locale;
  accent: Accent;
  density: Density;
  reducedMotion: boolean;
  /** Whether the user has completed (or skipped) onboarding. */
  onboarded: boolean;
  matrixView: MatrixView;
  setLocale: (l: Locale) => void;
  setAccent: (a: Accent) => void;
  setDensity: (d: Density) => void;
  setReducedMotion: (b: boolean) => void;
  setOnboarded: (b: boolean) => void;
  setMatrixView: (v: MatrixView) => void;
  /** Apply appearance prefs fetched from the account WITHOUT re-pushing them. */
  applyServerAppearance: (s: Pick<AppSettings, "locale" | "accent" | "density" | "reduced_motion">) => void;
  /** Pull appearance prefs from the account (source of truth) on sign-in. */
  loadAppearance: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      locale: "en",
      accent: "green",
      density: "comfortable",
      reducedMotion: false,
      onboarded: false,
      matrixView: "matrix",
      setLocale: (locale) => {
        set({ locale });
        persistAppearance({ locale });
      },
      setAccent: (accent) => {
        applyAccentTheme(accent);
        set({ accent });
        persistAppearance({ accent });
      },
      setDensity: (density) => {
        set({ density });
        persistAppearance({ density });
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion });
        persistAppearance({ reduced_motion: reducedMotion });
      },
      setOnboarded: (onboarded) => set({ onboarded }),
      setMatrixView: (matrixView) => set({ matrixView }),
      applyServerAppearance: (s) => {
        applyAccentTheme(s.accent);
        set({
          locale: s.locale,
          accent: s.accent,
          density: s.density,
          reducedMotion: s.reduced_motion,
        });
      },
      async loadAppearance() {
        try {
          const s = await api.getSettings();
          get().applyServerAppearance(s);
        } catch {
          // Keep the local prefs if the account fetch fails — never blank the UI.
        }
      },
    }),
    { name: "lumo.app.v1" }
  )
);
