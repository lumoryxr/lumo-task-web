import { describe, it, expect } from "vitest";
import { splitKeywords, hasKeyword } from "../highlightKeywords";

const keyHits = (s: string) => splitKeywords(s).filter((x) => x.key).map((x) => x.text);
const rejoin = (s: string) => splitKeywords(s).map((x) => x.text).join("");

describe("splitKeywords", () => {
  it("returns a single plain segment when there is no keyword", () => {
    expect(splitKeywords("买菜做饭")).toEqual([{ text: "买菜做饭", key: false }]);
    expect(hasKeyword("买菜做饭")).toBe(false);
  });

  it("highlights Chinese deadline/time words", () => {
    expect(keyHits("明天交周报")).toEqual(["明天"]);
    expect(keyHits("周五之前搞定")).toEqual(["周五"]);
    expect(keyHits("这个月底结账")).toEqual(["月底"]);
  });

  it("highlights Chinese priority/urgency words", () => {
    expect(keyHits("紧急处理线上问题")).toEqual(["紧急"]);
    expect(keyHits("必须今天完成")).toEqual(["必须", "今天"]);
  });

  it("highlights English keywords case-insensitively, whole-word only", () => {
    expect(keyHits("Finish report by Tomorrow")).toEqual(["Tomorrow"]);
    expect(keyHits("URGENT: ship it")).toEqual(["URGENT"]);
    // whole-word: "todayish" must NOT match "today"
    expect(keyHits("todayish plans")).toEqual([]);
  });

  it("highlights priority codes and clock times", () => {
    expect(keyHits("P0 incident")).toEqual(["P0"]);
    expect(keyHits("call at 15:00 sharp")).toEqual(["15:00"]);
    expect(keyHits("standup 9点")).toEqual(["9点"]);
    expect(keyHits("meet 3pm")).toEqual(["3pm"]);
  });

  it("preserves the original text exactly (no dropped/duplicated chars)", () => {
    const samples = ["明天3pm和张三开会 urgent", "no markers here", "周末 P1 收尾 deadline"];
    for (const s of samples) expect(rejoin(s)).toBe(s);
  });

  it("handles empty input", () => {
    expect(splitKeywords("")).toEqual([]);
  });
});
