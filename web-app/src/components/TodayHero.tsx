import { ProgressRing } from "@/components/ProgressRing";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";

/**
 * Time-of-day bucket for the greeting. Pure + exported so it can be unit-tested
 * without depending on the wall clock.
 */
export function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

interface TodayHeroProps {
  /** Display name, when signed in. Omitted in local mode so we don't greet "You". */
  name?: string;
  /** Tasks completed today. */
  done: number;
  /** Today's total workload (done + remaining). */
  total: number;
}

/**
 * Today page header — a localized date eyebrow, a time-of-day greeting, and a
 * completion progress ring. Mirrors the marketing mockup Jalen approved
 * (0704). The ring/subline only appear when there's a workload to summarize.
 */
export function TodayHero({ name, done, total }: TodayHeroProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const now = new Date();

  const period = greetingPeriod(now.getHours());
  const greeting =
    period === "morning"
      ? t("today.greeting.morning")
      : period === "afternoon"
        ? t("today.greeting.afternoon")
        : t("today.greeting.evening");

  const sep = name ? (locale === "zh" ? "，" : ", ") : "";
  const dateStr = now.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const subline =
    total > 0
      ? t("today.hero.subline").replace("{done}", String(done)).replace("{total}", String(total))
      : t("today.hero.empty");

  return (
    <div className="reveal-up flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <span className="eyebrow-pill mb-2.5">
          <span className="eyebrow-pill__dot" aria-hidden="true" />
          {dateStr}
        </span>
        <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-text-primary leading-tight truncate">
          {greeting}
          {sep}
          {name && <span className="gradient-text">{name}</span>}
        </h1>
        <div className="text-sm text-text-secondary mt-1.5">{subline}</div>
      </div>

      {total > 0 && (
        <div
          className="relative shrink-0 grid place-items-center"
          role="img"
          aria-label={`${pct}%`}
        >
          <ProgressRing pct={pct} color="var(--accent-primary)" size={56} stroke={5} />
          <span className="absolute text-[12px] font-bold tabular-nums text-text-primary">
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}
