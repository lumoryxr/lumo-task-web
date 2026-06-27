import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../SettingsPage";

// ── Store mocks (identity i18n so tab labels render as their keys) ──────────────

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: () => ({
    accent: "green",
    setAccent: vi.fn(),
    density: "comfortable",
    setDensity: vi.fn(),
    reducedMotion: false,
    setReducedMotion: vi.fn(),
    locale: "en",
    setLocale: vi.fn(),
    setOnboarded: vi.fn(),
  }),
}));

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: (sel: any) => sel({ reset: vi.fn() }),
}));

vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: () => ({
    people: [],
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/store/usePetStore", () => ({
  usePetStore: () => ({
    species: "dog",
    petName: "",
    setSpecies: vi.fn(),
    setPetName: vi.fn(),
    visible: true,
    toggleVisible: vi.fn(),
    setPos: vi.fn(),
  }),
}));

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  delete (window as any).electronAPI;
});

describe("SettingsPage · Cloud Sync tab gating (#112)", () => {
  it("hides the Cloud Sync tab on the web build (no electronAPI)", () => {
    // Web deployments connect directly to their own cloud DB; the local-first
    // sync toggle is desktop-only and otherwise errors with NO_CLOUD_BASE.
    renderPage();
    expect(screen.queryByText("settings.sync")).not.toBeInTheDocument();
  });

  it("shows the Cloud Sync tab on the desktop build (electronAPI present)", () => {
    (window as any).electronAPI = { isElectron: true };
    renderPage();
    expect(screen.getByText("settings.sync")).toBeInTheDocument();
  });
});
