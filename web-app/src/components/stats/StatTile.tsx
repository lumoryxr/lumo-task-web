import type { ReactNode } from "react";
import { useT } from "@/i18n/useT";

/**
 * A KPI tile: icon, label, the figure, a signed change against the previous
 * period (arrow + words, never colour alone) and an optional sparkline of the
 * range, its latest point in the accent colour.
 */
export function StatTile({
  icon,
  label,
  value,
  sub,
  delta,
  rangeDays,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  /** Percent change vs the previous period; null = nothing to compare; undefined = no delta row. */
  delta?: number | null;
  rangeDays?: number;
  trend?: number[];
}) {
  const t = useT();
  return (
    <div className="surface-card p-4 flex flex-col gap-3 min-w-0" role="group" aria-label={label}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
          style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}
        >
          {icon}
        </span>
        <span className="text-[12px] font-medium text-text-secondary truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <div className="text-[28px] font-semibold leading-none text-text-primary">{value}</div>
          {sub && <div className="text-[11.5px] text-text-muted mt-1.5 truncate">{sub}</div>}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} />}
      </div>
      {delta !== undefined && <div className="mt-auto" />}
      {delta !== undefined && <DeltaLine delta={delta} rangeDays={rangeDays ?? 0} hasValue={value !== "0"} t={t} />}
    </div>
  );
}

function DeltaLine({ delta, rangeDays, hasValue, t }: { delta: number | null; rangeDays: number; hasValue: boolean; t: (k: string) => string }) {
  const vs = t("stats.delta.vs").replace("{n}", String(rangeDays));
  if (delta === null) {
    return <div className="text-[11.5px] text-text-faint">{hasValue ? t("stats.delta.new") : vs}</div>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const text = flat
    ? t("stats.delta.flat")
    : t(up ? "stats.delta.up" : "stats.delta.down").replace("{pct}", String(Math.abs(delta)));
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-semibold"
        style={{
          color: flat ? "var(--text-muted)" : up ? "var(--accent-primary)" : "var(--status-warning)",
          background: flat ? "var(--bg-elevated)" : up ? "var(--accent-fog)" : "color-mix(in srgb, var(--status-warning) 12%, transparent)",
        }}
      >
        <span aria-hidden="true">{flat ? "→" : up ? "▲" : "▼"}</span>
        {text}
      </span>
      <span className="text-text-faint truncate">{vs}</span>
    </div>
  );
}

/** 2px line in the de-emphasis ink, with the latest value marked in the accent. */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const n = values.length;
  const pts = values.map((v, i) => [(i / (n - 1)) * 100, 26 - (v / max) * 22] as const);
  const last = pts[n - 1];
  return (
    <div className="relative flex-shrink-0" style={{ width: 84, height: 28 }} aria-hidden="true">
      <svg width="84" height="28" viewBox="0 0 100 28" preserveAspectRatio="none" className="block overflow-visible">
        <polyline
          points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          width: 8,
          height: 8,
          left: `calc(${last[0]}% - 4px)`,
          top: `calc(${(last[1] / 28) * 100}% - 4px)`,
          background: "var(--accent-primary)",
          boxShadow: "0 0 0 2px var(--bg-surface)",
        }}
      />
    </div>
  );
}
