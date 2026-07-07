import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CalendarFeedCard } from "../SettingsPage";

const getCalendarFeed = vi.fn();
const rotateCalendarFeed = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    getCalendarFeed: () => getCalendarFeed(),
    rotateCalendarFeed: () => rotateCalendarFeed(),
  },
}));

vi.mock("@/store/useToastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Identity t() → assertions read on i18n keys, locale-independent.
const t = (k: string) => k;

beforeEach(() => {
  getCalendarFeed.mockReset();
  rotateCalendarFeed.mockReset();
});

describe("CalendarFeedCard", () => {
  it("loads the feed URL on mount and shows it", async () => {
    getCalendarFeed.mockResolvedValue({ token: "tok", url: "https://x/v1/calendar/feed.ics?token=tok" });
    render(<CalendarFeedCard t={t} />);
    const input = (await screen.findByLabelText("calendar.feed.title")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("https://x/v1/calendar/feed.ics?token=tok"));
    expect(getCalendarFeed).toHaveBeenCalledTimes(1);
  });

  it("regenerate requires confirmation, then rotates and swaps the URL", async () => {
    getCalendarFeed.mockResolvedValue({ token: "old", url: "https://x/feed.ics?token=old" });
    rotateCalendarFeed.mockResolvedValue({ token: "new", url: "https://x/feed.ics?token=new" });
    render(<CalendarFeedCard t={t} />);

    const input = (await screen.findByLabelText("calendar.feed.title")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain("token=old"));

    // Clicking Regenerate opens a confirm dialog — it must NOT rotate yet.
    fireEvent.click(screen.getByText("calendar.feed.regenerate"));
    expect(rotateCalendarFeed).not.toHaveBeenCalled();

    // Confirm dialog shows its message; confirming triggers the rotate.
    expect(screen.getByText("calendar.feed.regenerate.confirm")).toBeTruthy();
    const confirmBtns = screen.getAllByText("calendar.feed.regenerate");
    fireEvent.click(confirmBtns[confirmBtns.length - 1]); // the dialog's confirm button

    await waitFor(() => expect(rotateCalendarFeed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input.value).toContain("token=new"));
  });

  it("copies the URL to the clipboard", async () => {
    getCalendarFeed.mockResolvedValue({ token: "tok", url: "https://x/feed.ics?token=tok" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CalendarFeedCard t={t} />);
    await screen.findByLabelText("calendar.feed.title");
    fireEvent.click(screen.getByText("calendar.feed.copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://x/feed.ics?token=tok"));
  });
});
