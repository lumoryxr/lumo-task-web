import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { FeedbackPanel } from "../FeedbackPanel";

const listFeedback = vi.fn();
const submitFeedback = vi.fn();
const adminListFeedback = vi.fn();
const adminUpdateFeedback = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    listFeedback: () => listFeedback(),
    submitFeedback: (input: unknown) => submitFeedback(input),
    adminListFeedback: () => adminListFeedback(),
    adminUpdateFeedback: (id: string, patch: unknown) => adminUpdateFeedback(id, patch),
  },
}));

vi.mock("@/store/useToastStore", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Identity t() → assertions read on i18n keys, locale-independent.
const t = (k: string) => k;

function item(over: Record<string, unknown> = {}) {
  return {
    id: "fb_1",
    message: "It crashed",
    category: "bug",
    status: "open",
    response: null,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  listFeedback.mockReset();
  submitFeedback.mockReset();
  adminListFeedback.mockReset();
  adminUpdateFeedback.mockReset();
});

describe("FeedbackPanel — user", () => {
  it("loads own feedback on mount and shows message, status, and the team reply", async () => {
    listFeedback.mockResolvedValue({
      feedback: [item({ status: "resolved", response: "Fixed in 1.2" })],
      isAdmin: false,
    });
    render(<FeedbackPanel t={t} />);

    expect(await screen.findByText("It crashed")).toBeTruthy();
    expect(screen.getByText("settings.feedback.status.resolved")).toBeTruthy();
    expect(screen.getByText("settings.feedback.reply.label")).toBeTruthy();
    expect(screen.getByText("Fixed in 1.2")).toBeTruthy();
    // No admin section for a non-admin.
    expect(screen.queryByText("settings.feedback.admin.title")).toBeNull();
  });

  it("shows the empty state when there is no feedback", async () => {
    listFeedback.mockResolvedValue({ feedback: [], isAdmin: false });
    render(<FeedbackPanel t={t} />);
    expect(await screen.findByText("settings.feedback.mine.empty")).toBeTruthy();
  });

  it("submit is disabled until a message is typed, then sends and prepends the item", async () => {
    listFeedback.mockResolvedValue({ feedback: [], isAdmin: false });
    submitFeedback.mockResolvedValue(item({ id: "fb_new", message: "New idea", category: "idea" }));
    render(<FeedbackPanel t={t} />);

    await screen.findByText("settings.feedback.mine.empty");

    const send = screen.getByRole("button", { name: "settings.feedback.submit" });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    const textarea = screen.getByLabelText("settings.feedback.title");
    fireEvent.change(textarea, { target: { value: "  New idea  " } });
    expect((send as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(send);

    // Message is trimmed before sending.
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith({ message: "New idea", category: "bug" }));
    // The created item appears in the list, and the textarea is cleared.
    expect(await screen.findByText("New idea")).toBeTruthy();
    await waitFor(() => expect((textarea as HTMLTextAreaElement).value).toBe(""));
  });

  it("shows a load-error message when the list fails", async () => {
    listFeedback.mockRejectedValue(new Error("boom"));
    render(<FeedbackPanel t={t} />);
    expect(await screen.findByText("settings.feedback.loadError")).toBeTruthy();
  });
});

describe("FeedbackPanel — admin", () => {
  it("renders the admin queue when isAdmin, and saving calls adminUpdateFeedback", async () => {
    listFeedback.mockResolvedValue({ feedback: [], isAdmin: true });
    adminListFeedback.mockResolvedValue([
      { ...item({ id: "fb_a1", message: "Please add tags" }), submitter: { user_id: "u_9", email: "u@x.com", name: "Uma" } },
    ]);
    adminUpdateFeedback.mockResolvedValue({
      ...item({ id: "fb_a1", message: "Please add tags", status: "resolved", response: "Shipped!" }),
      submitter: { user_id: "u_9", email: "u@x.com", name: "Uma" },
    });

    render(<FeedbackPanel t={t} />);

    // Admin section + the other user's submission are visible.
    expect(await screen.findByText("settings.feedback.admin.title")).toBeTruthy();
    expect(screen.getByText("Please add tags")).toBeTruthy();

    // Write a reply and save.
    const reply = screen.getByLabelText("settings.feedback.reply.label — fb_a1");
    fireEvent.change(reply, { target: { value: "Shipped!" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.feedback.admin.save" }));

    await waitFor(() =>
      expect(adminUpdateFeedback).toHaveBeenCalledWith("fb_a1", { status: "open", response: "Shipped!" }),
    );
    // The updated reply is reflected in the list.
    expect(await screen.findByText("Shipped!")).toBeTruthy();
  });

  it("clears a reply by sending response:null when the textarea is emptied", async () => {
    listFeedback.mockResolvedValue({ feedback: [], isAdmin: true });
    adminListFeedback.mockResolvedValue([
      { ...item({ id: "fb_a2", response: "old reply" }), submitter: { user_id: "u_1", email: null, name: "Ann" } },
    ]);
    adminUpdateFeedback.mockResolvedValue({
      ...item({ id: "fb_a2", response: null }),
      submitter: { user_id: "u_1", email: null, name: "Ann" },
    });

    render(<FeedbackPanel t={t} />);
    const reply = (await screen.findByLabelText("settings.feedback.reply.label — fb_a2")) as HTMLTextAreaElement;
    expect(reply.value).toBe("old reply");

    fireEvent.change(reply, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.feedback.admin.save" }));

    await waitFor(() =>
      expect(adminUpdateFeedback).toHaveBeenCalledWith("fb_a2", { status: "open", response: null }),
    );
  });
});
