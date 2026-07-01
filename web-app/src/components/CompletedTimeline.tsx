import { IconUndo } from "@/components/icons";
import { useT, useLocaleString } from "@/i18n/useT";
import { TaskTitle } from "@/components/TaskTitle";
import { useTasksStore } from "@/store/useTasksStore";
import { fmtDuration } from "@/lib/format";
import type { CompletedEntry, Locale } from "@/types/task";

const Q_CHIP: Record<string, string> = {
  Q1: "chip chip-q1",
  Q2: "chip chip-q2",
  Q3: "chip chip-q3",
  Q4: "chip chip-q4",
  unclassified: "chip",
};

function fmtTime(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

interface Props {
  entries: CompletedEntry[];
  locale: Locale;
}

export function CompletedTimeline({ entries, locale }: Props) {
  const ls = useLocaleString();
  const t = useT();
  const reopen = useTasksStore((s) => s.reopen);

  const total = entries.reduce((s, c) => s + c.duration, 0);
  const totalLabel =
    total >= 60
      ? t("timeline.dur.hm").replace("{h}", String(Math.floor(total / 60))).replace("{m}", String(total % 60))
      : t("timeline.dur.min").replace("{m}", String(total));

  const sorted = [...entries].sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return ta - tb;
  });

  return (
    <section className="mt-10">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">
          {t("timeline.today")}
        </span>
        <span
          className="text-[11px] tabular-nums text-text-faint px-2 py-0.5 rounded-full border"
          style={{ borderColor: "var(--border-faint)" }}
        >
          {entries.length} {t(entries.length === 1 ? "timeline.count.one" : "timeline.count.other")}
        </span>
        <span className="flex-1 h-px" style={{ background: "var(--border-faint)" }} />
        <span className="text-[11px] tabular-nums text-text-faint">
          {t("timeline.total").replace("{x}", totalLabel)}
        </span>
      </div>

      <div className="flex flex-col">
        {sorted.map((entry, idx) => {
          const isLast = idx === sorted.length - 1;
          const timeStart = fmtTime(entry.startedAt, locale);
          const timeEnd = fmtTime(entry.completedAt, locale);
          const qChip = entry.quadrant ? (Q_CHIP[entry.quadrant] ?? "chip") : null;

          return (
            <div key={entry.id} className="timeline-entry group flex gap-0">
              <div
                className="flex flex-col items-end gap-0.5 flex-shrink-0 pt-0.5"
                style={{ width: 80, minWidth: 80 }}
              >
                {timeStart && (
                  <span className="timeline-time-start text-[11px] leading-none">{timeStart}</span>
                )}
                {timeEnd && timeEnd !== timeStart && (
                  <span className="timeline-time-end text-[11px] leading-none">{timeEnd}</span>
                )}
              </div>

              <div className="flex flex-col items-center mx-4 flex-shrink-0">
                <div
                  className="timeline-node flex-shrink-0 rounded-full mt-1"
                  style={{ width: 12, height: 12, borderColor: "var(--accent-primary)", background: "var(--bg-base)" }}
                />
                {!isLast && (
                  <div className="timeline-node-connector flex-1 w-px mt-1" style={{ minHeight: 32 }} />
                )}
              </div>

              <div className="timeline-card flex-1" style={{ paddingBottom: isLast ? 0 : 16 }}>
                <div className="flex items-start gap-2">
                  <span className="timeline-task-title flex-1 text-sm font-medium leading-snug">
                    <TaskTitle text={ls(entry.title)} />
                  </span>
                  <button
                    onClick={() => reopen(entry.id)}
                    title={t("today.reopen")}
                    className="timeline-reopen-btn flex-shrink-0 flex items-center gap-1 px-2 py-0.5 text-[11px]"
                  >
                    <IconUndo size={11} />
                    {t("today.reopen")}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {qChip && (
                    <span className={qChip} style={{ fontSize: 10, padding: "1px 7px" }}>
                      {entry.quadrant}
                    </span>
                  )}
                  <span className="text-[11px] tabular-nums text-text-faint">
                    {fmtDuration(entry.duration, locale)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
