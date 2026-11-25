// @vitest-environment node
import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx, exportBundleToSheets, MAX_CELL_CHARS } from "../xlsx";

function files(bytes: Uint8Array) {
  const raw = unzipSync(bytes);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strFromU8(v)]));
}

describe("buildXlsx", () => {
  it("writes a valid workbook package with one worksheet per sheet, in order", () => {
    const out = files(
      buildXlsx([
        { name: "Tasks", rows: [["id", "title"], ["t1", "Write <tests> & ship"]] },
        { name: "People", rows: [["name"], ["Alice"]] },
      ]),
    );
    expect(Object.keys(out)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    expect(out["xl/workbook.xml"]).toMatch(/<sheet name="Tasks" sheetId="1" r:id="rId1"\/>.*<sheet name="People" sheetId="2"/s);
    // Text is escaped, the header row is bold (style 1) and frozen.
    expect(out["xl/worksheets/sheet1.xml"]).toContain("Write &lt;tests&gt; &amp; ship");
    expect(out["xl/worksheets/sheet1.xml"]).toMatch(/<c r="A1" s="1" t="inlineStr">/);
    expect(out["xl/worksheets/sheet1.xml"]).toContain('<pane ySplit="1"');
  });

  it("writes numbers and booleans as typed cells, and leaves nulls empty", () => {
    const out = files(buildXlsx([{ name: "S", rows: [["a", "b", "c"], [42, true, null]] }]));
    const sheet = out["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A2"><v>42</v></c>');
    expect(sheet).toContain('<c r="B2" t="b"><v>1</v></c>');
    expect(sheet).not.toContain('r="C2"');
  });

  it("makes sheet names Excel-safe and unique", () => {
    const out = files(
      buildXlsx([
        { name: "A/B:C*?[x]", rows: [] },
        { name: "A/B:C*?[x]", rows: [] },
        { name: "x".repeat(40), rows: [] },
      ]),
    );
    const names = [...out["xl/workbook.xml"].matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
    expect(names[0]).toBe("A B C x");
    expect(names[1]).not.toBe(names[0]);
    expect(names[2].length).toBeLessThanOrEqual(31);
  });

  it("caps a cell at Excel's limit instead of producing a file Excel rejects", () => {
    const out = files(buildXlsx([{ name: "S", rows: [["x"], ["a".repeat(MAX_CELL_CHARS + 100)]] }]));
    const text = out["xl/worksheets/sheet1.xml"].match(/<t xml:space="preserve">(a+)…?<\/t>/);
    expect(text?.[1].length).toBeLessThanOrEqual(MAX_CELL_CHARS);
  });

  it("drops characters XML cannot carry", () => {
    const out = files(buildXlsx([{ name: "S", rows: [["bad\u0001char"]] }]));
    expect(out["xl/worksheets/sheet1.xml"]).toContain("badchar");
  });
});

describe("exportBundleToSheets", () => {
  const t = (k: string) => k;

  it("puts each kind of data on its own sheet, with a header row of every column seen", () => {
    const sheets = exportBundleToSheets(
      {
        format_version: 1,
        exported_at: "2026-11-25T10:00:00.000Z",
        user: { id: "u1", username: "alex", email: null, name: "Alex", initials: "AL", plan: "free", created_at: "2026-01-01" },
        settings: { locale: "en", accent: "green" },
        tasks: [{ id: "t1", title_en: "A", tags_json: '["x"]' }, { id: "t2", title_en: "B", due: "2026-12-01" }],
        completed: [],
        people: [{ id: "p1", name: "Alice" }],
        habits: [],
        habit_logs: [],
        countdowns: [],
        projects: [{ id: "pr1", name: "Launch", goals_json: [{ text: "Ship" }] }],
        templates: [],
      },
      t,
    );
    const byName = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
    expect(sheets.map((s) => s.name)).toEqual([
      "account.export.sheet.profile",
      "account.export.sheet.settings",
      "account.export.sheet.tasks",
      "account.export.sheet.completed",
      "account.export.sheet.projects",
      "account.export.sheet.people",
      "account.export.sheet.habits",
      "account.export.sheet.habitLogs",
      "account.export.sheet.countdowns",
    ]);
    // Key/value sheets for the single objects.
    expect(byName["account.export.sheet.profile"]).toContainEqual(["name", "Alex"]);
    expect(byName["account.export.sheet.settings"]).toContainEqual(["accent", "green"]);
    // Table sheets: union of columns, missing values blank, nested values as JSON text.
    expect(byName["account.export.sheet.tasks"][0]).toEqual(["id", "title_en", "tags_json", "due"]);
    expect(byName["account.export.sheet.tasks"][2]).toEqual(["t2", "B", null, "2026-12-01"]);
    expect(byName["account.export.sheet.projects"][1]).toEqual(["pr1", "Launch", '[{"text":"Ship"}]']);
    // An empty kind still gets its sheet, saying so.
    expect(byName["account.export.sheet.habits"]).toEqual([["account.export.sheet.empty"]]);
  });
});
