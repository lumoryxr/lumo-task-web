import { describe, it, expect } from "vitest";
import { topbarTitle } from "../topbarTitle";

const t = (key: string) => key;

describe("topbarTitle", () => {
  it("names a project's own page after its section, not Today", () => {
    expect(topbarTitle("/projects/p1", t)).toEqual({ title: "nav.projects" });
    expect(topbarTitle("/projects", t).title).toBe("nav.projects");
  });

  it("names the other sections that used to fall back to Today", () => {
    expect(topbarTitle("/habits", t).title).toBe("nav.habits");
    expect(topbarTitle("/stats", t).title).toBe("nav.stats");
    expect(topbarTitle("/countdown", t).title).toBe("nav.countdown");
  });

  it("keeps the title and subtitle of the main views", () => {
    expect(topbarTitle("/matrix", t)).toEqual({ title: "matrix.title", sub: "matrix.sub" });
    expect(topbarTitle("/today", t)).toEqual({ title: "today.title", sub: "today.sub" });
  });

  it("falls back to Today for an unknown route", () => {
    expect(topbarTitle("/nowhere", t).title).toBe("today.title");
  });
});
