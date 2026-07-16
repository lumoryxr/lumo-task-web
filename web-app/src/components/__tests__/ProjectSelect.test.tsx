import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectSelect } from "../ProjectSelect";
import type { Project } from "@/types/task";

vi.mock("@/i18n/useT", () => ({
  useT: () => (key: string) => key,
}));

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    color: "green",
    goals: [],
    status: "active",
    pinned: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const PROJECTS: Project[] = [
  project({ id: "prj_a", name: "Alpha", emoji: "🅰️" }),
  project({ id: "prj_b", name: "Beta" }),
];

function getTrigger() {
  return screen.getByRole("button", { name: "project.select.label" });
}

describe("ProjectSelect", () => {
  it("shows the 'none' label when nothing is selected", () => {
    render(<ProjectSelect label="project.select.label" value={null} onChange={vi.fn()} projects={PROJECTS} />);
    expect(getTrigger().textContent).toContain("project.select.none");
  });

  it("shows the selected project's emoji and name in the trigger", () => {
    render(<ProjectSelect label="project.select.label" value="prj_a" onChange={vi.fn()} projects={PROJECTS} />);
    expect(getTrigger().textContent).toContain("🅰️");
    expect(getTrigger().textContent).toContain("Alpha");
  });

  it("opens the menu and lists a 'none' option plus every project", () => {
    render(<ProjectSelect label="project.select.label" value={null} onChange={vi.fn()} projects={PROJECTS} />);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(getTrigger());
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "project.select.none" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Alpha/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Beta" })).toBeTruthy();
  });

  it("marks the current selection as aria-selected", () => {
    render(<ProjectSelect label="project.select.label" value="prj_b" onChange={vi.fn()} projects={PROJECTS} />);
    fireEvent.click(getTrigger());
    expect(screen.getByRole("option", { name: "Beta" }).getAttribute("aria-selected")).toBe("true");
  });

  it("calls onChange with the picked project id and closes", () => {
    const onChange = vi.fn();
    render(<ProjectSelect label="project.select.label" value={null} onChange={onChange} projects={PROJECTS} />);
    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));

    expect(onChange).toHaveBeenCalledWith("prj_b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("calls onChange with null when the 'none' option is picked", () => {
    const onChange = vi.fn();
    render(<ProjectSelect label="project.select.label" value="prj_a" onChange={onChange} projects={PROJECTS} />);
    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByRole("option", { name: "project.select.none" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("closes on Escape", () => {
    render(<ProjectSelect label="project.select.label" value={null} onChange={vi.fn()} projects={PROJECTS} />);
    fireEvent.click(getTrigger());
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
