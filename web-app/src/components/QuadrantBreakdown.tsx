import { useT } from "@/i18n/useT";
import type { QuadrantCount } from "@/utils/stats";

const QUADRANT_COLOR: Record<string, string> = {
  Q1: "var(--q1-color)",
  Q2: "var(--q2-color)",
  Q3: "var(--q3-color)",
  Q4: "var(--q4-color)",
  unclassified: "var(--text-faint)",
};

function quadrantLabel(q: string, t: (k: string) => string): string {
  if (q === "unclassified") return t("stats.quadrant.unclassified");
  return q;
}

interface Props {
  breakdown: QuadrantCount[];
}

export function QuadrantBreakdown({ breakdown }: Props) {
  const t = useT();
  const total = breakdown.reduce((s, b) => s + b.count, 0);

  let callout: string | null = null;
  if (total >= 5) {
    const q2Pct = breakdown.find((b) => b.quadrant === "Q2")?.percent ?? 0;
    const q1Pct = breakdown.find((b) => b.quadrant === "Q1")?.percent ?? 0;
    const q3Pct = breakdown.find((b) => b.quadrant === "Q3")?.percent ?? 0;
    const q4Pct = breakdown.find((b) => b.quadrant === "Q4")?.percent ?? 0;
    const q3q4Pct = q3Pct + q4Pct;

    if (q2Pct >= 30) {
      callout = t("stats.quadrant.callout.q2good").replace("{pct}", String(q2Pct));
    } else if (q1Pct >= 60) {
      callout = t("stats.quadrant.callout.q1heavy");
    } else if (q3q4Pct >= 40) {
      callout = t("stats.quadrant.callout.q3q4high").replace("{pct}", String(q3q4Pct));
    }
  }

  return (
    <div className="mt-4 p-4 surface-card">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-3">
        {t("stats.quadrant.breakdown")}
      </h3>
      <div className="flex flex-col gap-2.5">
        {breakdown.map((b) => (
          <div key={b.quadrant} className="flex items-center gap-2 min-w-0">
            <span
              className="text-[11px] font-semibold shrink-0 w-[72px]"
              style={{ color: b.count > 0 ? QUADRANT_COLOR[b.quadrant] : "var(--text-faint)" }}
            >
              {quadrantLabel(b.quadrant, t)}
            </span>
            <div
              role="progressbar"
              aria-valuenow={b.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${quadrantLabel(b.quadrant, t)} ${b.percent}%`}
              className="flex-1 h-1.5 rounded-full overflow-hidden min-w-0"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: b.count > 0 ? `${b.percent}%` : "0%",
                  background: QUADRANT_COLOR[b.quadrant],
                  opacity: b.count > 0 ? 1 : 0,
                }}
              />
            </div>
            <span className="text-[11px] text-text-muted tabular-nums shrink-0 w-[60px] text-right">
              {b.count > 0 ? `${b.count} · ${b.percent}%` : "—"}
            </span>
          </div>
        ))}
      </div>
      {callout && (
        <p className="mt-3 pt-3 text-[12px] text-text-muted border-t border-border-faint leading-relaxed">
          {callout}
        </p>
      )}
    </div>
  );
}
