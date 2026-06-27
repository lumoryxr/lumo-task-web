import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../SettingsPage";

// ── Mocks ───────────────────────────────────────────────────────────────────
// identity i18n: tab labels / panel headings render as their raw keys.
vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

// The "Data & Sync" tab mounts StoragePanel + (desktop only) SyncPanel, which
// call these on mount. Stub them so the panels render without real network.
vi.mock("@/api/client", () => ({
  api: {
    storageInfo: vi.fn().mockResolvedValue({
      dbPath: "/tmp/lumo.db",
      dbDir: "/tmp",
      dbSize: 1024,
      dbName: "lumo.db",
    }),
    syncStatus: vi.fn().mockResolvedValue({
      mode: "file",
      enabled: false,
      lastSyncedAt: null,
      lastError: null,
      pushCursor: { wall: 0, counter: 0 },
      pullCursor: { wall: 0, counter: 0 },
    }),
  },
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
  }),
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

function clickTab(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

afterEach(() => {
  cleanup();
  delete (window as any).electronAPI;
});

describe("SettingsPage · consolidated tabs (#111)", () => {
  const EXPECTED_TABS = [
    "settings.general",
    "settings.notifications",
    "settings.pet",
    "settings.members",
    "ai.config.title",
    "settings.integrations",
    "settings.dataSync",
  ];

  it("renders exactly the seven consolidated tabs", () => {
    renderPage();
    for (const label of EXPECTED_TABS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Old, now-removed standalone tabs are gone.
    expect(screen.queryByRole("button", { name: "settings.appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "settings.language" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "settings.storage" })).not.toBeInTheDocument();
  });

  it("folds language into the General tab", () => {
    renderPage();
    // General is the default tab; the language switch lives there now.
    expect(screen.getByText("settings.accent")).toBeInTheDocument();
    expect(screen.getByText("settings.language")).toBeInTheDocument();
  });

  it("drops the demo Data tab (reset demo data + replay onboarding)", () => {
    renderPage();
    expect(screen.queryByText("settings.resetData")).not.toBeInTheDocument();
    expect(screen.queryByText("settings.replayOnboarding")).not.toBeInTheDocument();
  });
});

describe("SettingsPage · Cloud Sync gating inside Data & Sync (#112)", () => {
  it("hides the Sync panel on the web build, keeping only Storage", () => {
    renderPage();
    clickTab("settings.dataSync");
    expect(screen.getByText("settings.storage")).toBeInTheDocument();
    // SyncPanel heading must NOT render on web (would only yield NO_CLOUD_BASE).
    expect(screen.queryByText("settings.sync")).not.toBeInTheDocument();
  });

  it("shows the Sync panel on the desktop build alongside Storage", () => {
    (window as any).electronAPI = { isElectron: true };
    renderPage();
    clickTab("settings.dataSync");
    expect(screen.getByText("settings.storage")).toBeInTheDocument();
    expect(screen.getByText("settings.sync")).toBeInTheDocument();
  });
});
