import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TaskHistoryButton } from "../TaskHistory";
import { useHistoryStore } from "@/store/useHistoryStore";

const { listCompletedPage, reopen } = vi.hoisted(() => ({ listCompletedPage: vi.fn(), reopen: vi.fn() }));

vi.mock("@/api/client", () => ({ api: { listCompletedPage } }));
vi.mock("@/store/useTasksStore", () => {
  const useTasksStore: any = (sel: any) => sel({ reopen });
  useTasksStore.getState = () => ({ reopen });
  return { useTasksStore };
});
vi.mock("@/store/useProjectsStore", () => ({
  useProjectsStore: (sel: any) => sel({ projects: [{ id: "p1", name: "Launch" }] }),
}));
vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: (sel: any) =>
    sel({ byId: (id: string) => (id === "p_ann" ? { id, name: "Ann Lee", initials: "AL", color: "var(--accent-primary)" } : undefined) }),
}));
vi.mock("@/store/useAppStore", () => {
  const useAppStore: any = (sel: any) => sel({ locale: "en" });
  useAppStore.getState = () => ({ locale: "en" });
  return { useAppStore };
});

function at(daysAgo: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

const ENTRIES = [
  {
    id: "e1", taskId: "t1", title: { en: "Write launch post" }, duration: 45, quadrant: "Q1",
    completedAt: at(0, 14, 30), projectId: "p1", tags: ["writing"],
    subtasks: [
      { id: "s1", title: "Outline", completed: true, assignee_id: "p_ann" },
      { id: "s2", title: "Proofread", completed: false },
    ],
  },
  { id: "e2", taskId: "t2", title: { en: "Pay invoices" }, duration: 15, quadrant: "Q3", completedAt: at(1, 9, 5), subtasks: [] },
  { id: "e3", taskId: "t3", title: { en: "Plan offsite" }, duration: 60, quadrant: "Q2", completedAt: at(40, 18, 0), subtasks: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  useHistoryStore.setState({ projectId: null, entries: [], nextCursor: null, loaded: false, loading: false, loadingMore: false, error: false });
  listCompletedPage.mockResolvedValue({ entries: ENTRIES, nextCursor: null });
});

async function openHistory() {
  render(<TaskHistoryButton />);
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  const dialog = await screen.findByRole("dialog", { name: "Completed history" });
  await within(dialog).findByText("Write launch post");
  return dialog;
}

describe("TaskHistoryButton", () => {
  it("is a small trigger that loads history only when opened", async () => {
    render(<TaskHistoryButton />);
    expect(listCompletedPage).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    await screen.findByRole("dialog", { name: "Completed history" });
    expect(listCompletedPage).toHaveBeenCalledTimes(1);
  });

  it("groups closed tasks by day, newest first, under Today / Yesterday / a date", async () => {
    const dialog = await openHistory();
    const days = within(dialog).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(days[0]).toMatch(/^Today/);
    expect(days[1]).toMatch(/^Yesterday/);
    expect(days).toHaveLength(3);
    const today = within(dialog).getByRole("region", { name: /^Today/ });
    expect(within(today).getByText("Write launch post")).toBeInTheDocument();
    expect(within(today).getByText("14:30")).toBeInTheDocument();
  });

  it("shows each task's quadrant, time spent, project and tags", async () => {
    const dialog = await openHistory();
    const item = within(dialog).getByRole("listitem", { name: "Write launch post" });
    expect(within(item).getByText("Q1")).toBeInTheDocument();
    expect(within(item).getByText("45m")).toBeInTheDocument();
    expect(within(item).getByText("Launch")).toBeInTheDocument();
    expect(within(item).getByText("#writing")).toBeInTheDocument();
  });

  it("folds subtasks behind a summary that expands in place", async () => {
    const dialog = await openHistory();
    const toggle = within(dialog).getByRole("button", { name: "Subtasks 1/2" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByText("Outline")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = within(dialog).getByRole("list", { name: "Subtasks 1/2" });
    expect(within(list).getByText("Outline").closest("li")).toHaveAttribute("data-done", "true");
    expect(within(list).getByText("Proofread").closest("li")).toHaveAttribute("data-done", "false");
  });

  it("shows who owned each subtask", async () => {
    const dialog = await openHistory();
    fireEvent.click(within(dialog).getByRole("button", { name: "Subtasks 1/2" }));
    const list = within(dialog).getByRole("list", { name: "Subtasks 1/2" });
    const outline = within(list).getByText("Outline").closest("li")!;
    expect(within(outline).getByTitle("Ann Lee")).toBeInTheDocument();
    const proofread = within(list).getByText("Proofread").closest("li")!;
    expect(within(proofread).queryByTitle("Ann Lee")).toBeNull();
  });

  it("shows no subtask summary for a task without subtasks", async () => {
    const dialog = await openHistory();
    const item = within(dialog).getByRole("listitem", { name: "Pay invoices" });
    expect(within(item).queryByRole("button", { name: /Subtasks/ })).toBeNull();
  });

  it("filters by title or subtask text", async () => {
    const dialog = await openHistory();
    const search = within(dialog).getByRole("searchbox", { name: "Search completed tasks" });
    fireEvent.change(search, { target: { value: "invoice" } });
    expect(within(dialog).getByText("Pay invoices")).toBeInTheDocument();
    expect(within(dialog).queryByText("Write launch post")).toBeNull();
    fireEvent.change(search, { target: { value: "proofread" } });
    expect(within(dialog).getByText("Write launch post")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(within(dialog).getByText("No matching tasks")).toBeInTheDocument();
  });

  it("loads older history on demand", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: ENTRIES.slice(0, 1), nextCursor: "next" });
    render(<TaskHistoryButton />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const dialog = await screen.findByRole("dialog", { name: "Completed history" });
    listCompletedPage.mockResolvedValueOnce({ entries: ENTRIES.slice(1), nextCursor: null });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Load more" }));
    await within(dialog).findByText("Plan offsite");
    expect(listCompletedPage).toHaveBeenLastCalledWith("next", 50, undefined);
    expect(within(dialog).queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("can reopen a closed task", async () => {
    reopen.mockResolvedValue(undefined);
    const dialog = await openHistory();
    const item = within(dialog).getByRole("listitem", { name: "Pay invoices" });
    fireEvent.click(within(item).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(reopen).toHaveBeenCalledWith("e2"));
    await waitFor(() => expect(within(dialog).queryByText("Pay invoices")).toBeNull());
  });

  it("shows an empty state when nothing has been closed yet", async () => {
    listCompletedPage.mockResolvedValueOnce({ entries: [], nextCursor: null });
    render(<TaskHistoryButton />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("No completed tasks yet.")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    listCompletedPage.mockRejectedValueOnce(new Error("offline"));
    render(<TaskHistoryButton />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Write launch post")).toBeInTheDocument();
  });

  it("closes with the X button", async () => {
    await openHistory();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("TaskHistoryButton · one project", () => {
  it("loads only that project's history and names the project", async () => {
    render(<TaskHistoryButton projectId="p1" projectName="Launch" />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const dialog = await screen.findByRole("dialog", { name: "Completed history" });
    expect(listCompletedPage).toHaveBeenCalledWith(undefined, 50, "p1");
    expect(within(dialog).getByText("Launch")).toBeInTheDocument();
    // Every entry is in this project, so the per-item project chip is redundant.
    const item = await within(dialog).findByRole("listitem", { name: "Write launch post" });
    expect(within(item).queryByText("Launch")).toBeNull();
  });
});
