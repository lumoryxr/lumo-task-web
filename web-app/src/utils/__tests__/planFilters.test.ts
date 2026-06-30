import { describe, it, expect } from "vitest";
import { derivePlanProjects, resolveActiveFilter, filterPlanTasks } from "@/utils/planFilters";

const projects = [
  { id: "p1", name: "Beta" },
  { id: "p2", name: "Alpha" },
];

describe("derivePlanProjects", () => {
  it("returns distinct referenced projects, name-resolved and sorted", () => {
    const tasks = [
      { project_id: "p1" }, { project_id: "p2" }, { project_id: "p1" }, { project_id: null },
    ];
    expect(derivePlanProjects(tasks, projects)).toEqual([
      { id: "p2", name: "Alpha" },
      { id: "p1", name: "Beta" },
    ]);
  });

  it("falls back to the id when a project is not loaded", () => {
    expect(derivePlanProjects([{ project_id: "ghost" }], projects)).toEqual([{ id: "ghost", name: "ghost" }]);
  });

  it("is empty when no task is filed", () => {
    expect(derivePlanProjects([{ project_id: null }, {}], projects)).toEqual([]);
  });
});

describe("resolveActiveFilter", () => {
  it("keeps a value that is still available", () => {
    expect(resolveActiveFilter("p1", ["p1", "p2"])).toBe("p1");
  });
  it("drops a stale value no longer in the options (no stranded empty list)", () => {
    expect(resolveActiveFilter("p1", ["p2"])).toBeNull();
  });
  it("passes null through", () => {
    expect(resolveActiveFilter(null, ["p1"])).toBeNull();
  });
});

describe("filterPlanTasks", () => {
  const tasks = [
    { project_id: "p1", tags: ["work"] },
    { project_id: "p2", tags: ["work", "home"] },
    { project_id: "p1", tags: ["home"] },
    { project_id: null, tags: [] },
  ];

  it("returns all tasks when no filter is active", () => {
    expect(filterPlanTasks(tasks, null, null)).toHaveLength(4);
  });

  it("filters by tag only", () => {
    expect(filterPlanTasks(tasks, "home", null)).toHaveLength(2);
  });

  it("filters by project only", () => {
    expect(filterPlanTasks(tasks, null, "p1")).toHaveLength(2);
  });

  it("applies tag AND project conjunctively", () => {
    const r = filterPlanTasks(tasks, "home", "p1");
    expect(r).toHaveLength(1);
    expect(r[0].project_id).toBe("p1");
    expect(r[0].tags).toContain("home");
  });

  it("can yield an empty list when the combo matches nothing", () => {
    expect(filterPlanTasks([{ project_id: "p1", tags: ["work"] }], "missing", "p1")).toHaveLength(0);
  });
});
