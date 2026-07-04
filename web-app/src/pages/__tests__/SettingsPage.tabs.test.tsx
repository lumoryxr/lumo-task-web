import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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

const peopleMock = vi.hoisted(() => ({ people: [] as any[], remove: vi.fn() }));
vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: () => ({
    people: peopleMock.people,
    create: vi.fn(),
    update: vi.fn(),
    remove: peopleMock.remove,
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
  peopleMock.people = [];
  peopleMock.remove.mockReset();
});

describe("SettingsPage · consolidated tabs (#111)", () => {
  // On web, Data & Sync is hidden (desktop-only), so the web build shows six tabs.
  const WEB_TABS = [
    "settings.general",
    "settings.notifications",
    "settings.pet",
    "settings.members",
    "ai.config.title",
    "settings.integrations",
  ];

  it("renders exactly the six consolidated tabs on web (Data & Sync is desktop-only)", () => {
    renderPage();
    for (const label of WEB_TABS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // Data & Sync tab is hidden on the web build.
    expect(screen.queryByRole("button", { name: "settings.dataSync" })).not.toBeInTheDocument();
    // Old, now-removed standalone tabs are gone.
    expect(screen.queryByRole("button", { name: "settings.appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "settings.language" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "settings.storage" })).not.toBeInTheDocument();
  });

  it("adds the Data & Sync tab on the desktop build", () => {
    (window as any).electronAPI = { isElectron: true };
    renderPage();
    for (const label of [...WEB_TABS, "settings.dataSync"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
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

  it("confirms via ConfirmDialog before removing a member", () => {
    peopleMock.people = [{ id: "u1", name: "Bob", email: "" }];
    renderPage();
    clickTab("settings.members");
    // Cancel path: the member must not be removed.
    fireEvent.click(screen.getByText("settings.members.delete"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("common.cancel"));
    expect(peopleMock.remove).not.toHaveBeenCalled();
    // Confirm path: remove is called with the member id.
    fireEvent.click(screen.getByText("settings.members.delete"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("settings.members.delete"));
    expect(peopleMock.remove).toHaveBeenCalledWith("u1");
  });
});

describe("SettingsPage · Data & Sync is desktop-only (#112)", () => {
  it("hides the whole Data & Sync tab (Storage + Sync) on the web build", () => {
    renderPage();
    // No tab to open, and neither panel renders anywhere on web.
    expect(screen.queryByRole("button", { name: "settings.dataSync" })).not.toBeInTheDocument();
    expect(screen.queryByText("settings.storage")).not.toBeInTheDocument();
    expect(screen.queryByText("settings.sync")).not.toBeInTheDocument();
  });

  it("shows Storage + Sync inside the Data & Sync tab on the desktop build", () => {
    (window as any).electronAPI = { isElectron: true };
    renderPage();
    clickTab("settings.dataSync");
    expect(screen.getByText("settings.storage")).toBeInTheDocument();
    expect(screen.getByText("settings.sync")).toBeInTheDocument();
  });
});
