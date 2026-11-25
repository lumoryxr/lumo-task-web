import { zipSync, strToU8 } from "fflate";
import type { DataExportWire } from "@lumo/contracts";

/**
 * A tiny, dependency-light .xlsx writer (Office Open XML SpreadsheetML) for the
 * account data export: one worksheet per sheet, a bold frozen header row,
 * columns sized to their content, text as inline strings. Only `fflate` is
 * used, for the zip container — no full spreadsheet library in the bundle.
 */

export type CellValue = string | number | boolean | null | undefined;
export interface Sheet {
  name: string;
  rows: CellValue[][];
}

/** Excel's hard limit on characters in one cell. */
export const MAX_CELL_CHARS = 32_767;
const MAX_SHEET_NAME = 31;

// Characters XML 1.0 cannot carry at all (C0 controls other than tab/LF/CR).
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function xmlText(s: string): string {
  return s
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(ref: string, value: CellValue, header: boolean): string {
  const style = header ? ' s="1"' : "";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
  let text = String(value);
  if (text.length > MAX_CELL_CHARS) text = text.slice(0, MAX_CELL_CHARS - 1) + "…";
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;
}

function sheetXml(rows: CellValue[][]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((v, i) => {
      const len = v === null || v === undefined ? 0 : Math.min(String(v).length, 60);
      widths[i] = Math.max(widths[i] ?? 8, len + 2);
    });
  }
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(w, 60)}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const body = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(`${colName(c)}${r + 1}`, v, r === 0)).join("")}</row>`)
    .join("");
  const freeze =
    rows.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${freeze}${cols}<sheetData>${body}</sheetData></worksheet>`
  );
}

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], not blank, unique (case-insensitive). */
function safeSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    let base = raw.replace(/[:\\/?*[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SHEET_NAME) || `Sheet${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      base = base.slice(0, MAX_SHEET_NAME - suffix.length);
      name = base + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Build an .xlsx file (zip bytes) from sheets of rows; the first row of each is its header. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = safeSheetNames(sheets.map((s) => s.name));
  const NS = "http://schemas.openxmlformats.org";
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Types xmlns="${NS}/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("") +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${NS}/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        "</Relationships>",
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>` +
        names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="${NS}/package/2006/relationships">` +
        sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    ),
    // Two cell formats: 0 = normal, 1 = bold (the header row).
    "xl/styles.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<styleSheet xmlns="${NS}/spreadsheetml/2006/main">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>",
    ),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows));
  });
  return zipSync(files, { level: 6 });
}

// ── The account export, as sheets ────────────────────────────────────────────

type Row = Record<string, unknown>;

function cell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return JSON.stringify(v);
}

/** One object as a two-column Field / Value sheet. */
function keyValueRows(obj: Row | null | undefined, t: (k: string) => string): CellValue[][] {
  const entries = Object.entries(obj ?? {});
  if (entries.length === 0) return [[t("account.export.sheet.empty")]];
  return [[t("account.export.col.field"), t("account.export.col.value")], ...entries.map(([k, v]) => [k, cell(v)])];
}

/** A list of records as a table: a header of every column seen (first-seen order), one row each. */
function tableRows(records: Row[] | undefined, t: (k: string) => string): CellValue[][] {
  if (!records || records.length === 0) return [[t("account.export.sheet.empty")]];
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  return [columns, ...records.map((r) => columns.map((c) => (c in r ? cell(r[c]) : null)))];
}

/**
 * The data export bundle as workbook sheets: Profile and Settings as Field /
 * Value sheets, then one table sheet per kind of record. Every kind gets a
 * sheet, even when empty, so the workbook always has the same shape.
 */
export function exportBundleToSheets(bundle: DataExportWire, t: (k: string) => string): Sheet[] {
  const b = bundle as unknown as Record<string, unknown>;
  const table = (key: string, sheet: string): Sheet => ({
    name: t(`account.export.sheet.${sheet}`),
    rows: tableRows(b[key] as Row[] | undefined, t),
  });
  return [
    { name: t("account.export.sheet.profile"), rows: keyValueRows({ ...(b.user as Row), exported_at: b.exported_at }, t) },
    { name: t("account.export.sheet.settings"), rows: keyValueRows(b.settings as Row | null, t) },
    table("tasks", "tasks"),
    table("completed", "completed"),
    table("projects", "projects"),
    table("people", "people"),
    table("habits", "habits"),
    table("habit_logs", "habitLogs"),
    table("countdowns", "countdowns"),
  ];
}
