import { useId } from "react";
import { useT } from "@/i18n/useT";
import { toISODate } from "@/lib/format";
import { FieldAction, FieldLabel } from "./FieldLabel";

function nextMonday(from: Date): string {
  const daysUntil = ((8 - from.getDay()) % 7) || 7;
  return toISODate(new Date(from.getTime() + daysUntil * 86400000));
}

/** Due date: Today / Tomorrow / Next week, or any date, on one line; "Clear" removes it. */
export function DuePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const t = useT();
  const labelId = useId();
  const now = new Date();
  const picks = [
    { label: t("due.today"), value: toISODate(now) },
    { label: t("due.tomorrow"), value: toISODate(new Date(now.getTime() + 86400000)) },
    { label: t("due.nextWeek"), value: nextMonday(now) },
  ];
  return (
    <div>
      <FieldLabel id={labelId} action={value ? <FieldAction onClick={() => onChange("")}>{t("due.none")}</FieldAction> : undefined}>
        {t("qc.due")}
      </FieldLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {picks.map((p) => {
          const active = value === p.value;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              aria-pressed={active}
              className="text-[11px] px-2 h-8 rounded-md transition-colors"
              style={{
                background: active ? "var(--accent-fog)" : "var(--bg-surface)",
                border: `1px solid ${active ? "var(--accent-edge)" : "var(--border-default)"}`,
                color: active ? "var(--accent-primary)" : "var(--text-muted)",
              }}
            >
              {p.label}
            </button>
          );
        })}
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("qc.due")}
          className="input flex-1 min-w-[140px]"
          style={{ colorScheme: "dark", cursor: "pointer", height: 32 }}
        />
      </div>
    </div>
  );
}
