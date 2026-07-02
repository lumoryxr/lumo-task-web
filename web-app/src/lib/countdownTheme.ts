// Auto-detects a "category theme" for a countdown event from its emoji + title,
// so each card can show a content-related background motif (cake for a birthday,
// heart for an anniversary, plane for a trip, …) with zero manual tagging.

import type { CountdownEvent } from "@/types/task";

export type CountdownTheme =
  | "birthday"
  | "love"
  | "travel"
  | "graduation"
  | "festival"
  | "milestone"
  | "default";

// Themes are probed in this order; first match wins. Keep the most specific
// (birthday/love) ahead of the broad "milestone" catch-all.
const THEME_ORDER: Exclude<CountdownTheme, "default">[] = [
  "birthday",
  "love",
  "graduation",
  "travel",
  "festival",
  "milestone",
];

const THEME_HINTS: Record<
  Exclude<CountdownTheme, "default">,
  { emoji: string[]; words: string[] }
> = {
  birthday: {
    emoji: ["🎂", "🎁", "🥳", "🎈"],
    words: ["birthday", "bday", "生日", "诞辰"],
  },
  love: {
    emoji: ["❤️", "❤", "💕", "💖", "💘", "💗", "💍", "💑", "👰", "🤵"],
    words: [
      "anniversary", "wedding", "valentine", "love",
      "纪念", "恋爱", "结婚", "婚礼", "相识", "在一起", "情人节", "表白",
    ],
  },
  graduation: {
    emoji: ["🎓", "📚", "✏️", "📝"],
    words: [
      "graduation", "graduate", "exam", "test", "defense",
      "毕业", "考试", "答辩", "高考", "考研", "期末", "开学",
    ],
  },
  travel: {
    emoji: ["✈️", "🛫", "🧳", "🏖️", "🗺️", "🚗", "🚄", "⛱️", "🏝️"],
    words: [
      "travel", "trip", "flight", "vacation", "holiday trip", "journey",
      "旅行", "旅游", "航班", "出发", "度假", "出游", "机票", "行程",
    ],
  },
  festival: {
    emoji: ["🎄", "🎉", "🎊", "🧧", "🎆", "🎇", "🪔", "🕯️"],
    words: [
      "christmas", "new year", "spring festival", "festival",
      "圣诞", "新年", "春节", "元旦", "除夕", "节日", "国庆", "中秋", "跨年",
    ],
  },
  milestone: {
    emoji: ["🚀", "🏆", "📈", "📊", "🎯", "💼", "⭐", "🏁", "🔥"],
    words: [
      "launch", "release", "deadline", "ddl", "project", "goal", "kpi",
      "target", "milestone", "due", "sprint", "demo",
      "发布", "上线", "截止", "项目", "目标", "里程碑", "冲刺", "交付",
    ],
  },
};

/** Detect the background theme for a countdown event. Emoji is the strongest
 *  signal; falls back to keyword matching on the title. */
export function detectCountdownTheme(
  event: Pick<CountdownEvent, "emoji" | "title">,
): CountdownTheme {
  const emoji = (event.emoji || "").trim();
  const title = (event.title || "").toLowerCase();

  // 1) Exact emoji match wins.
  if (emoji) {
    for (const theme of THEME_ORDER) {
      if (THEME_HINTS[theme].emoji.includes(emoji)) return theme;
    }
  }

  // 2) Keyword match on the title.
  if (title) {
    for (const theme of THEME_ORDER) {
      if (THEME_HINTS[theme].words.some((w) => title.includes(w))) return theme;
    }
  }

  return "default";
}
