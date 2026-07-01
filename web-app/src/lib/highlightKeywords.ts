/**
 * Keyword highlighting for task titles.
 *
 * Splits a title into plain and "key" segments so the shared <TaskTitle>
 * component can visually emphasize the information that matters most at a
 * glance — deadlines/time words and priority/urgency words — instead of
 * rendering the whole title as flat text. Locale-independent: a single pass
 * catches both Chinese and English markers so mixed-language titles work.
 *
 * Pure and synchronous so it can be unit-tested without a DOM.
 */

export interface TitleSegment {
  text: string;
  /** true → render emphasized (accent + bold); false → plain. */
  key: boolean;
}

// Chinese markers (no \b — CJK has no word boundaries; matched literally).
const ZH =
  "今天|今晚|今早|明天|明早|明晚|后天|大后天|周[一二三四五六日天]|周末|本周|下周|这周|本月|下月|月底|月初|截止|到期|限今[天日]|紧急|加急|重要|必须|务必|尽快|马上|立刻|立即";

// Latin markers — whole-word only (\b) and case-insensitive via the `i` flag.
const EN =
  "today|tonight|tomorrow|deadline|ddl|urgent|asap|important|critical|priority|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend";

// Priority codes (P0–P4) and clock times (15:00 / 3pm / 9点).
const CODES = "P[0-4]\\b";
const CLOCK = "\\d{1,2}[:：]\\d{2}|\\d{1,2}\\s?[ap]m\\b|\\d{1,2}\\s?点";

const KEYWORD_RE = new RegExp(
  `(${ZH})|(\\b(?:${EN})\\b)|(${CODES})|(${CLOCK})`,
  "gi",
);

/**
 * Break `text` into ordered segments, marking keyword hits. Adjacent segments
 * of the same kind are not merged — callers just map each to a node.
 */
export function splitKeywords(text: string): TitleSegment[] {
  if (!text) return [];
  const out: TitleSegment[] = [];
  let last = 0;
  // Fresh lastIndex per call (module-level regex is stateful with the g flag).
  KEYWORD_RE.lastIndex = 0;
  for (let m = KEYWORD_RE.exec(text); m !== null; m = KEYWORD_RE.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), key: false });
    out.push({ text: m[0], key: true });
    last = m.index + m[0].length;
    // Guard against zero-length matches to avoid an infinite loop.
    if (m[0].length === 0) KEYWORD_RE.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), key: false });
  return out;
}

/** True if the title contains at least one highlightable keyword. */
export function hasKeyword(text: string): boolean {
  KEYWORD_RE.lastIndex = 0;
  return KEYWORD_RE.test(text);
}
