import { useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/useT";
import type { DailyPoint } from "@/utils/statsDashboard";

const PLOT_H = 150;

/** A clean upper bound for the y-axis and its ticks (0, step, 2·step…). */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 4) return { top: 4, ticks: [0, 2, 4] };
  const rough = max / 3;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

function fmtDate(iso: string, locale: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", opts);
}

/**
 * Tasks finished per day across the range: one column per day in the accent
 * colour, a solid hairline grid, a labelled average line, and a tooltip on
 * hover or keyboard focus (←/→ move between days). The same numbers are in a
 * table for screen readers.
 */
export function DailyChart({ points, locale }: { points: DailyPoint[]; locale: string }) {
  const t = useT();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.count));
  const { top, ticks } = niceScale(max);
  const total = points.reduce((s, p) => s + p.count, 0);
  const avg = points.length ? total / points.length : 0;
  const many = points.length > 14;
  // A date label every so often, always including the first and the last day.
  const labelEvery = points.length <= 7 ? 1 : points.length <= 31 ? 7 : 14;
  const showLabel = (i: number) => i === points.length - 1 || (points.length - 1 - i) % labelEvery === 0;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const cur = active ?? points.length - 1;
    setActive(Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const a = active !== null ? points[active] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* y-axis */}
        <div className="relative flex-shrink-0 w-6 text-right" style={{ height: PLOT_H }} aria-hidden="true">
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute right-0 text-[10.5px] tabular-nums text-text-faint leading-none"
              style={{ bottom: `calc(${(v / top) * 100}% - 5px)` }}
            >
              {v}
            </span>
          ))}
        </div>
        {/* plot */}
        <div
          role="img"
          aria-label={t("stats.trend.aria").replace("{n}", String(total)).replace("{d}", String(points.length))}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setActive((v) => v ?? points.length - 1)}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="relative flex-1 min-w-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{ height: PLOT_H, outlineColor: "var(--accent-edge)" }}
        >
          {ticks.map((v) => (
            <span
              key={v}
              aria-hidden="true"
              className="absolute left-0 right-0"
              style={{ bottom: `${(v / top) * 100}%`, height: 1, background: "var(--border-faint)" }}
            />
          ))}
          {/* Each day's slot is its hit target (no dead gaps between columns);
              the column itself keeps a 2px surface gap via the slot padding. */}
          <div className="absolute inset-0 flex items-end">
            {points.map((p, i) => (
              <div
                key={p.date}
                className={`relative flex-1 h-full flex items-end justify-center cursor-default ${many ? "px-px" : "px-1"}`}
                onPointerEnter={() => setActive(i)}
              >
                {p.count > 0 && (
                  <div
                    className="w-full transition-opacity"
                    style={{
                      maxWidth: 24,
                      height: `${(p.count / top) * 100}%`,
                      borderRadius: "4px 4px 0 0",
                      background: "var(--accent-primary)",
                      opacity: active === null || active === i ? 1 : 0.45,
                    }}
                  />
                )}
                {active === i && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none"
                    style={{ width: 1, background: "var(--border-strong)", zIndex: -1 }}
                  />
                )}
              </div>
            ))}
          </div>
          {/* Average line, drawn over the columns so its label stays readable */}
          {avg > 0 && (
            <div
              aria-hidden="true"
              className="absolute left-0 right-0 z-[1] flex justify-end pointer-events-none"
              style={{ bottom: `${(avg / top) * 100}%`, borderTop: "1px solid var(--accent-edge)" }}
            >
              <span className="-mt-[15px] text-[10.5px] text-text-muted px-1 rounded" style={{ background: "var(--bg-surface)" }}>
                {t("stats.trend.avg").replace("{n}", avg.toFixed(1))}
              </span>
            </div>
          )}
          {a && active !== null && (
            <div
              role="status"
              className="absolute z-10 pointer-events-none rounded-lg px-2.5 py-1.5 whitespace-nowrap"
              style={{
                left: `${((active + 0.5) / points.length) * 100}%`,
                top: -6,
                transform: `translate(${active < points.length * 0.15 ? "-10%" : active > points.length * 0.85 ? "-90%" : "-50%"}, -100%)`,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                boxShadow: "var(--shadow-lifted)",
              }}
            >
              <div className="text-[13px] font-semibold text-text-primary">
                {t("stats.trend.tasks").replace("{n}", String(a.count))}
              </div>
              <div className="text-[11px] text-text-muted">
                {fmtDate(a.date, locale, { weekday: "short", month: "short", day: "numeric" })}
                {" · "}
                {t("stats.trend.minutes").replace("{n}", String(a.minutes))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* x-axis */}
      <div className="flex pl-8" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.date} className="relative flex-1 min-w-0 text-center">
            {showLabel(i) && (
              <span className="absolute left-1/2 -translate-x-1/2 text-[10.5px] text-text-faint whitespace-nowrap">
                {points.length <= 7
                  ? fmtDate(p.date, locale, { weekday: "short" })
                  : fmtDate(p.date, locale, { month: "numeric", day: "numeric" })}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="h-3" aria-hidden="true" />
      <table className="sr-only">
        <caption>{t("stats.trend.title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("stats.col.date")}</th>
            <th scope="col">{t("stats.col.tasks")}</th>
            <th scope="col">{t("stats.col.minutes")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.count}</td>
              <td>{p.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
