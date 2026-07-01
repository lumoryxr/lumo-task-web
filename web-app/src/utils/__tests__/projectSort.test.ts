import { describe, it, expect } from "vitest";
import { sortProjects } from "@/utils/projectSort";

const P = (id: string, name: string, updatedAt: string) => ({ id, name, updatedAt });

const PROJECTS = [
  P("a", "Banana", "2026-06-01T00:00:00.000Z"),
  P("b", "apple", "2026-06-03T00:00:00.000Z"),
  P("c", "Cherry", "2026-06-02T00:00:00.000Z"),
];

const pct = (id: string) => ({ a: 10, b: 90, c: 50 })[id] ?? 0;

describe("sortProjects", () => {
  it("recent → most recently updated first", () => {
    expect(sortProjects(PROJECTS, "recent", pct).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("name → case-insensitive A→Z", () => {
    expect(sortProjects(PROJECTS, "name", pct).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("progress → highest completion first", () => {
    expect(sortProjects(PROJECTS, "progress", pct).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("progress → ties fall back to most-recent", () => {
    const flat = () => 0; // all equal
    expect(sortProjects(PROJECTS, "progress", flat).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [...PROJECTS];
    sortProjects(input, "name", pct);
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("pinned projects float to the top regardless of mode", () => {
    const withPin = [
      { ...P("a", "Banana", "2026-06-01T00:00:00.000Z") },
      { ...P("b", "apple", "2026-06-03T00:00:00.000Z"), pinned: true },
      { ...P("c", "Cherry", "2026-06-02T00:00:00.000Z") },
    ];
    // Name mode would order b,a,c; pinned b already leads. Pin the last instead:
    const pinnedC = [
      { ...P("a", "Banana", "2026-06-01T00:00:00.000Z") },
      { ...P("b", "apple", "2026-06-03T00:00:00.000Z") },
      { ...P("c", "Cherry", "2026-06-02T00:00:00.000Z"), pinned: true },
    ];
    expect(sortProjects(pinnedC, "name", pct)[0].id).toBe("c"); // pinned wins over A→Z
    expect(sortProjects(withPin, "recent", pct)[0].id).toBe("b");
  });
});
