import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ImportCalendarCard } from "../SettingsPage";
import { useImportedCalendarStore } from "@/store/useImportedCalendarStore";

vi.mock("@/store/useToastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// t() returns the key, but the component does `.replace("{n}", …)` on it, so use
// a translator that echoes the key with the placeholders intact.
const t = (k: string) => k;

const ICS =
  "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Meeting\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";

/** A File whose .text() resolves to the given content (jsdom-safe). */
function icsFile(content: string, name = "cal.ics"): File {
  const f = new File([content], name, { type: "text/calendar" });
  // jsdom's File.text() can be flaky across versions — pin it deterministically.
  Object.defineProperty(f, "text", { value: () => Promise.resolve(content) });
  return f;
}

beforeEach(() => {
  useImportedCalendarStore.getState().clear();
});

describe("ImportCalendarCard", () => {
  it("shows the import button and no Clear before anything is imported", () => {
    render(<ImportCalendarCard t={t} />);
    expect(screen.getByText("calendar.import.button")).toBeTruthy();
    expect(screen.queryByText("calendar.import.clear")).toBeNull();
  });

  it("imports an .ics file, stores the events, and reveals Clear", async () => {
    const { container } = render(<ImportCalendarCard t={t} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [icsFile(ICS)] } });

    await waitFor(() => expect(useImportedCalendarStore.getState().events).toHaveLength(1));
    expect(useImportedCalendarStore.getState().sourceName).toBe("cal.ics");
    // Clear button now appears; clicking it empties the store.
    const clearBtn = await screen.findByText("calendar.import.clear");
    fireEvent.click(clearBtn);
    await waitFor(() => expect(useImportedCalendarStore.getState().events).toHaveLength(0));
  });
});
