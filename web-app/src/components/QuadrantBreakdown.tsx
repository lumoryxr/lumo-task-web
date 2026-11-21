import { useState } from "react";
import { useT } from "@/i18n/useT";
import { quadrantCallout, type QuadrantCount } from "@/utils/stats";

// Quadrant identity colours are the same tokens the Matrix, chips and dots use
// everywhere, so a quadrant reads the same on every screen.
const QUADRANT_COLOR: Record<string, string> = {
  Q1: "var(--q1-color)",
  Q2: "var(--q2-color)",
  Q3: "var(--q3-color)",
  Q4: "var(--q4-color)",
  unclassified: "var(--text-faint)",
};

const NAME_KEY: Record<string, string> = {
  Q1: "matrix.q1",
  Q2: "matrix.q2",
  Q3: "matrix.q3",
  Q4: "matrix.q4",
};

/**
 * Where finished work landed in the Eisenhower matrix: one tall segmented bar
 * (each quadrant a block, its share printed inside when it fits) above a list
 * that names each quadrant with its colour swatch and count, plus a one-line
 * reading of the split.
 */
export function QuadrantBreakdown({ breakdown }: { breakdown: QuadrantCount[] }) {
  const t = useT();
  const [hover, setHover] = useState<string | null>(null);
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  const parts = breakdown.filter((b) => b.count > 0);
  const callout = quadrantCallout(breakdown);
  const label = (q: string) => (q === "unclassified" ? t("stats.quadrant.unclassified") : `${q} · ${t(NAME_KEY[q])}`);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="img"
        aria-label={parts.map((b) => `${label(b.quadrant)} ${b.count} (${b.percent}%)`).join(", ") || t("stats.period.empty")}
        className="flex w-full gap-[2px]"
        style={{ height: 28 }}
      >
        {total === 0 ? (
          <div className="flex-1 rounded" style={{ background: "var(--bg-elevated)" }} />
        ) : (
          parts.map((b) => (
            <div
              key={b.quadrant}
              data-quadrant={b.quadrant}
              onPointerEnter={() => setHover(b.quadrant)}
              onPointerLeave={() => setHover(null)}
              className="flex items-center min-w-0 rounded transition-opacity"
              style={{
                width: `${b.percent}%`,
                minWidth: 4,
                background: QUADRANT_COLOR[b.quadrant],
                opacity: hover === null || hover === b.quadrant ? 1 : 0.5,
              }}
              title={`${label(b.quadrant)}: ${b.count} · ${b.percent}%`}
            >
              {b.percent >= 9 && (
                <span className="pl-2 text-[11.5px] font-semibold" style={{ color: "var(--text-inverse)" }}>
                  {b.percent}%
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {breakdown.map((b) => (
          <li
            key={b.quadrant}
            className="flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
            style={{ background: hover === b.quadrant ? "var(--bg-subtle)" : "transparent" }}
            onPointerEnter={() => setHover(b.quadrant)}
            onPointerLeave={() => setHover(null)}
          >
            <span
              aria-hidden="true"
              className="flex-shrink-0 rounded-sm"
              style={{ width: 10, height: 10, background: QUADRANT_COLOR[b.quadrant], opacity: b.count > 0 ? 1 : 0.35 }}
            />
            <span className="flex-1 min-w-0 truncate text-[12.5px] text-text-secondary">{label(b.quadrant)}</span>
            <span className="text-[12.5px] font-semibold text-text-primary tabular-nums">
              {b.count > 0 ? b.count : "—"}
            </span>
            {b.count > 0 && b.percent < 9 && (
              <span className="text-[11px] text-text-faint tabular-nums w-8 text-right">{b.percent}%</span>
            )}
          </li>
        ))}
      </ul>

      {callout && (
        <p
          className="text-[12.5px] text-text-secondary leading-relaxed rounded-lg px-3 py-2"
          style={{ background: "var(--bg-elevated)" }}
        >
          {t(callout.key).replace("{pct}", String(callout.pct ?? ""))}
        </p>
      )}
    </div>
  );
}
