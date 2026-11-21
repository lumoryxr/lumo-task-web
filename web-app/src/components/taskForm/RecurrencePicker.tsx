import { useId } from "react";
import { useT } from "@/i18n/useT";
import { FieldLabel } from "./FieldLabel";
import type { TaskRecurrence } from "@/types/task";

const OPTIONS: TaskRecurrence[] = ["none", "daily", "weekdays", "weekly", "monthly"];

/** Repeat rule as a row of chips, one pressed. */
export function RecurrencePicker({ value, onChange }: { value: TaskRecurrence; onChange: (r: TaskRecurrence) => void }) {
  const t = useT();
  const labelId = useId();
  return (
    <div>
      <FieldLabel id={labelId}>{t("task.recurrence")}</FieldLabel>
      <div role="group" aria-labelledby={labelId} className="flex gap-1.5 flex-wrap">
        {OPTIONS.map((r) => {
          const active = value === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              aria-pressed={active}
              className="px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors"
              style={{
                background: active ? "var(--accent-fog)" : "var(--bg-surface)",
                border: `1px solid ${active ? "var(--accent-edge)" : "var(--border-default)"}`,
                color: active ? "var(--accent-primary)" : "var(--text-secondary)",
              }}
            >
              {t(`task.recurrence.${r}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
