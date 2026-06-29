import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPatchSettings = vi.fn();
const mockGetSettings = vi.fn();
vi.mock("@/api/client", () => ({
  api: {
    patchSettings: (...a: unknown[]) => mockPatchSettings(...a),
    getSettings: (...a: unknown[]) => mockGetSettings(...a),
  },
}));

import { useAppStore } from "../useAppStore";

const TOKEN_KEY = "lumo.token";

function resetStore() {
  useAppStore.setState({
    locale: "en",
    accent: "green",
    density: "comfortable",
    reducedMotion: false,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useAppStore appearance persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(TOKEN_KEY);
    mockPatchSettings.mockResolvedValue({});
    resetStore();
  });

  describe("when signed in (token present)", () => {
    beforeEach(() => localStorage.setItem(TOKEN_KEY, "tok"));

    it("setAccent updates state AND pushes to the backend", () => {
      useAppStore.getState().setAccent("amber");
      expect(useAppStore.getState().accent).toBe("amber");
      expect(mockPatchSettings).toHaveBeenCalledWith({ accent: "amber" });
    });

    it("setLocale pushes the locale", () => {
      useAppStore.getState().setLocale("zh");
      expect(mockPatchSettings).toHaveBeenCalledWith({ locale: "zh" });
    });

    it("setDensity pushes the density", () => {
      useAppStore.getState().setDensity("compact");
      expect(mockPatchSettings).toHaveBeenCalledWith({ density: "compact" });
    });

    it("setReducedMotion maps to the snake_case backend field", () => {
      useAppStore.getState().setReducedMotion(true);
      expect(mockPatchSettings).toHaveBeenCalledWith({ reduced_motion: true });
    });

    it("a failed push never reverts the applied local value", async () => {
      mockPatchSettings.mockRejectedValueOnce(new Error("network"));
      useAppStore.getState().setAccent("cyan");
      // microtask flush
      await Promise.resolve();
      expect(useAppStore.getState().accent).toBe("cyan");
    });
  });

  describe("when NOT signed in (local mode, no token)", () => {
    it("setAccent updates state locally but does NOT call the backend", () => {
      useAppStore.getState().setAccent("graphite");
      expect(useAppStore.getState().accent).toBe("graphite");
      expect(mockPatchSettings).not.toHaveBeenCalled();
    });

    it("setLocale stays local (onboarding picks before sign-in)", () => {
      useAppStore.getState().setLocale("zh");
      expect(useAppStore.getState().locale).toBe("zh");
      expect(mockPatchSettings).not.toHaveBeenCalled();
    });
  });

  describe("hydration from the account", () => {
    it("loadAppearance applies server prefs and does NOT echo them back", async () => {
      mockGetSettings.mockResolvedValue({
        locale: "zh",
        accent: "amber",
        density: "compact",
        reduced_motion: true,
      });
      await useAppStore.getState().loadAppearance();
      const s = useAppStore.getState();
      expect(s.locale).toBe("zh");
      expect(s.accent).toBe("amber");
      expect(s.density).toBe("compact");
      expect(s.reducedMotion).toBe(true);
      // Hydration must not trigger a redundant PATCH of what we just fetched.
      expect(mockPatchSettings).not.toHaveBeenCalled();
    });

    it("loadAppearance keeps local prefs if the fetch fails", async () => {
      useAppStore.setState({ accent: "cyan" });
      mockGetSettings.mockRejectedValueOnce(new Error("offline"));
      await useAppStore.getState().loadAppearance();
      expect(useAppStore.getState().accent).toBe("cyan");
    });

    it("applyServerAppearance sets state without any push", () => {
      useAppStore.getState().applyServerAppearance({
        locale: "zh",
        accent: "graphite",
        density: "compact",
        reduced_motion: false,
      });
      expect(useAppStore.getState().accent).toBe("graphite");
      expect(mockPatchSettings).not.toHaveBeenCalled();
    });
  });
});
