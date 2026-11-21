import { useEffect, useId, useState } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { FieldLabel } from "./FieldLabel";

const STEP = 5;

/** Estimated minutes: − / + in 5-minute steps, or type a number (at least 1). */
export function DurationStepper({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const labelId = useId();
  const [raw, setRaw] = useState(String(value));
  // Follow outside changes (e.g. AI parse, reset) while not mid-typing.
  useEffect(() => { setRaw(String(value)); }, [value]);

  const btn = "flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-subtle transition-colors select-none";
  return (
    <div>
      <FieldLabel id={labelId}>{t("qc.duration")}</FieldLabel>
      <div className="flex items-center rounded-md border overflow-hidden" style={{ height: 34, borderColor: "var(--border-default)", background: "var(--bg-surface)" }}>
        <button type="button" aria-label={t("form.lessTime")} onClick={() => onChange(Math.max(1, value - STEP))} className={btn} style={{ width: 32, fontSize: 16, height: "100%" }}>−</button>
        <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
          <input
            type="number"
            min={1}
            value={raw}
            aria-labelledby={labelId}
            onChange={(e) => {
              setRaw(e.target.value);
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) onChange(v);
            }}
            onBlur={() => {
              const clamped = Math.max(1, Number.isNaN(parseInt(raw, 10)) ? value : parseInt(raw, 10));
              onChange(clamped);
              setRaw(String(clamped));
            }}
            className="tabular-nums font-semibold text-text-primary bg-transparent border-none outline-none text-center"
            style={{ fontSize: 13, width: 44 }}
          />
          <span className="text-[10px] text-text-muted flex-shrink-0">{locale === "zh" ? "分钟" : "min"}</span>
        </div>
        <button type="button" aria-label={t("form.moreTime")} onClick={() => onChange(value + STEP)} className={btn} style={{ width: 32, fontSize: 16, height: "100%" }}>+</button>
      </div>
    </div>
  );
}
