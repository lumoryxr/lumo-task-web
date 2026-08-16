import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { captureAttribution, getAttribution } from "../attribution";

const KEY = "lumo.attribution.v1";

describe("attribution", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures a ref tag on first visit", () => {
    const got = captureAttribution("?ref=share-weekly");
    expect(got?.source).toBe("share-weekly");
    expect(getAttribution()?.source).toBe("share-weekly");
    expect(got?.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falls back to utm_source and keeps medium + campaign", () => {
    const got = captureAttribution("?utm_source=sspai&utm_medium=post&utm_campaign=launch");
    expect(got).toMatchObject({ source: "sspai", medium: "post", campaign: "launch" });
  });

  it("prefers ref over utm_source when both are present", () => {
    expect(captureAttribution("?utm_source=b&ref=a")?.source).toBe("a");
  });

  it("keeps the FIRST touch and never overwrites it", () => {
    captureAttribution("?ref=sspai");
    const second = captureAttribution("?ref=v2ex");
    expect(second?.source).toBe("sspai");
    expect(getAttribution()?.source).toBe("sspai");
  });

  it("returns null when the visit carries no tag and none is stored", () => {
    expect(captureAttribution("?foo=bar")).toBeNull();
    expect(getAttribution()).toBeNull();
  });

  it("returns the stored value on a later untagged visit", () => {
    captureAttribution("?ref=jike");
    expect(captureAttribution("")?.source).toBe("jike");
  });

  it("rejects tags that aren't plain analytics keys", () => {
    expect(captureAttribution("?ref=<script>alert(1)</script>")).toBeNull();
    expect(captureAttribution("?ref=drop%20table")).toBeNull();
    expect(getAttribution()).toBeNull();
  });

  it("truncates an over-long tag rather than storing it whole", () => {
    const got = captureAttribution(`?ref=${"a".repeat(200)}`);
    expect(got?.source).toHaveLength(64);
  });

  it("strips the tracking params from the address bar once captured", () => {
    captureAttribution("?ref=share-pet&keep=1");
    expect(window.history.replaceState).toHaveBeenCalled();
    const url = vi.mocked(window.history.replaceState).mock.calls[0][2] as string;
    expect(url).not.toContain("ref=");
    expect(url).toContain("keep=1");
  });

  it("survives corrupt stored JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(getAttribution()).toBeNull();
    expect(captureAttribution("?ref=ok")?.source).toBe("ok");
  });
});
