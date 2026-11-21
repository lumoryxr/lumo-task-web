import { useId } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { FieldLabel } from "./FieldLabel";
import type { Quadrant } from "@/types/task";

const QUADRANTS: Quadrant[] = ["Q1", "Q2", "Q3", "Q4"];

const Q_META: Record<Quadrant, { en: string; zh: string; descEn: string; descZh: string }> = {
  Q1: { en: "Do first", zh: "立即做", descEn: "Urgent & important", descZh: "紧急 + 重要" },
  Q2: { en: "Schedule", zh: "安排做", descEn: "Important, not urgent", descZh: "重要，不紧急" },
  Q3: { en: "Delegate", zh: "委托做", descEn: "Urgent, not important", descZh: "紧急，不重要" },
  Q4: { en: "Drop", zh: "减少做", descEn: "Neither", descZh: "都不是" },
  unclassified: { en: "Unsorted", zh: "未分类", descEn: "Not yet placed", descZh: "尚未归位" },
};

/** The four quadrants as one compact row (two per row on phones); the description is the tooltip. */
export function QuadrantPicker({ value, onChange }: { value: Quadrant; onChange: (q: Quadrant) => void }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const labelId = useId();
  return (
    <div>
      <FieldLabel id={labelId}>{t("qc.quadrant")}</FieldLabel>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {QUADRANTS.map((q) => {
          const meta = Q_META[q];
          const active = value === q;
          return (
            <button
              key={q}
              type="button"
              onClick={() => onChange(q)}
              aria-pressed={active}
              title={locale === "zh" ? meta.descZh : meta.descEn}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 h-9 min-w-0 transition-colors"
              style={{
                background: active ? "var(--bg-subtle)" : "var(--bg-surface)",
                borderColor: active ? "var(--border-strong)" : "var(--border-default)",
                boxShadow: active ? "0 0 0 1px var(--border-strong)" : "none",
              }}
            >
              <span className={`qdot qdot-${q.toLowerCase()}`} />
              <span className="text-[11px] font-semibold text-text-primary">{q}</span>
              <span className="text-[11px] font-medium truncate" style={{ color: `var(--q${q[1]}-color, var(--text-muted))` }}>
                {locale === "zh" ? meta.zh : meta.en}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
