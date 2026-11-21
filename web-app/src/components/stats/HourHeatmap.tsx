import { useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/useT";

/** Monday-first weekday keys (matching computeDashboard's heat rows). */
const WEEKDAY_KEYS = ["stats.day.mon", "stats.day.tue", "stats.day.wed", "stats.day.thu", "stats.day.fri", "stats.day.sat", "stats.day.sun"];
/** Accent share per step: one hue, more is stronger. */
const STEPS = [0, 28, 48, 72, 100];

function step(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((v / max) * 4)));
}

function cellColor(s: number): string {
  return s === 0 ? "var(--bg-elevated)" : `color-mix(in srgb, var(--accent-primary) ${STEPS[s]}%, var(--bg-elevated))`;
}

/**
 * When work gets finished: a weekday × hour grid in one accent hue (darker
 * cell = more done), a scale legend, and the exact count on hover or keyboard
 * focus (arrow keys move the cell). A table carries the same numbers.
 */
export function HourHeatmap({ heat, max }: { heat: number[][]; max: number }) {
  const t = useT();
  const [active, setActive] = useState<[number, number] | null>(null);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const [r, c] = active ?? [0, 9];
    setActive([Math.max(0, Math.min(6, r + m[0])), Math.max(0, Math.min(23, c + m[1]))]);
  }

  const readout = active
    ? t("stats.heat.cell")
        .replace("{day}", t(WEEKDAY_KEYS[active[0]]))
        .replace("{hour}", String(active[1]).padStart(2, "0"))
        .replace("{n}", String(heat[active[0]][active[1]]))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={t("stats.heat.sub")}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setActive((v) => v ?? [0, 9])}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{ outlineColor: "var(--accent-edge)" }}
      >
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "28px repeat(24, minmax(0, 1fr))" }}>
          {heat.map((row, r) => (
            <div key={r} className="contents">
              <span className="text-[10.5px] text-text-faint self-center pr-1" aria-hidden="true">
                {t(WEEKDAY_KEYS[r])}
              </span>
              {row.map((v, c) => {
                const on = active?.[0] === r && active?.[1] === c;
                return (
                  <span
                    key={c}
                    onPointerEnter={() => setActive([r, c])}
                    className="aspect-square rounded-[3px] transition-shadow"
                    style={{
                      background: cellColor(step(v, max)),
                      boxShadow: on ? "0 0 0 2px var(--bg-surface), 0 0 0 3.5px var(--text-secondary)" : "none",
                    }}
                  />
                );
              })}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="relative h-3" aria-hidden="true">
              {h % 6 === 0 && (
                <span className="absolute left-0 top-0.5 text-[10px] text-text-faint tabular-nums">{String(h).padStart(2, "0")}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 min-h-[18px]">
        <span className="text-[12px] text-text-secondary truncate" aria-live="polite">
          {readout}
        </span>
        <span className="flex items-center gap-1.5 text-[10.5px] text-text-faint flex-shrink-0" aria-hidden="true">
          {t("stats.heat.less")}
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} className="rounded-[3px]" style={{ width: 11, height: 11, background: cellColor(s) }} />
          ))}
          {t("stats.heat.more")}
        </span>
      </div>
      <table className="sr-only">
        <caption>{t("stats.heat.title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("stats.col.day")}</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col">{`${h}:00`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.map((row, r) => (
            <tr key={r}>
              <th scope="row">{t(WEEKDAY_KEYS[r])}</th>
              {row.map((v, c) => (
                <td key={c}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
