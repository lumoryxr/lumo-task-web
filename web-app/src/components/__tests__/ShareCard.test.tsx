import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockToBlob = vi.fn();
const mockToastError = vi.fn();

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({ toBlob: mockToBlob }),
}));

vi.mock("@/store/useToastStore", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

vi.mock("@/i18n/useT", () => ({
  useT: () => (k: string) => k,
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (sel: any) => sel({ locale: "en" }),
}));

import { ShareCard } from "../ShareCard";

const BASE_PROPS = {
  tasksCompleted: 7,
  focusHours: "4.2",
  currentStreak: 5,
  byDay: [1, 0, 2, 3, 1, 2, 0],
  userName: "Test User",
  weekLabel: "May 18–24",
};

describe("ShareCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToBlob.mockImplementation((cb: (b: Blob | null) => void) =>
      cb(new Blob(["png"], { type: "image/png" }))
    );
  });

  it("renders a share button", () => {
    render(<ShareCard {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: "stats.share.btn" })).toBeInTheDocument();
  });

  it("calls html2canvas when share button is clicked", async () => {
    const html2canvas = (await import("html2canvas")).default as ReturnType<typeof vi.fn>;
    render(<ShareCard {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "stats.share.btn" }));
    await waitFor(() => expect(html2canvas).toHaveBeenCalled());
  });

  it("disables share button while export is in progress", async () => {
    // html2canvas never resolves during this test
    const { default: html2canvas } = await import("html2canvas");
    (html2canvas as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    render(<ShareCard {...BASE_PROPS} />);
    const btn = screen.getByRole("button", { name: "stats.share.btn" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });

  it("routes the busy label through the message catalog (#122 — no hardcoded literal)", async () => {
    // Regression: the busy label used to be an inline `locale === 'zh' ? '生成中…'
    // : 'Exporting…'` ternary that bypassed the catalog. With useT mocked to echo
    // the key, a catalog-routed label renders the KEY; a hardcoded literal would
    // render "Exporting…"/"生成中…" instead.
    const { default: html2canvas } = await import("html2canvas");
    (html2canvas as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise(() => {}));
    render(<ShareCard {...BASE_PROPS} />);
    const btn = screen.getByRole("button", { name: "stats.share.btn" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveTextContent("stats.share.busy"));
    expect(btn).not.toHaveTextContent("Exporting");
  });

  it("surfaces an error toast when export genuinely fails", async () => {
    const { default: html2canvas } = await import("html2canvas");
    (html2canvas as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    render(<ShareCard {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "stats.share.btn" }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("stats.share.error"));
  });

  it("stays silent when the user cancels the native share sheet", async () => {
    // canShare → true so the code takes the navigator.share path, which the
    // user dismisses (AbortError) — that must NOT raise an error toast.
    vi.stubGlobal("navigator", {
      ...navigator,
      share: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
      canShare: vi.fn().mockReturnValue(true),
    });
    render(<ShareCard {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "stats.share.btn" }));
    await waitFor(() =>
      expect((navigator.share as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    );
    expect(mockToastError).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
