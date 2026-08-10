import { useState } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import type { CalendarEvent } from "@/store/useImportedCalendarStore";

interface Props {
  event: CalendarEvent;
  onCreateTask: (title: string, due: string) => void;
}

function fmtTime(dtStr: string): string {
  try {
    return new Date(dtStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return dtStr.substring(11, 16);
  }
}

export function CalendarEventCard({ event, onCreateTask }: Props) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const [hovered, setHovered] = useState(false);

  const timeLabel = event.isAllDay
    ? locale === "zh"
      ? "全天"
      : "All day"
    : `${fmtTime(event.start.dateTime)} – ${fmtTime(event.end.dateTime)}`;

  const due = event.start.dateTime.substring(0, 10);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-stretch gap-1.5 rounded-md transition-all"
      style={{
        background: hovered ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)",
        border: `1px dashed ${hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
        minHeight: 36,
        padding: "5px 6px",
      }}
    >
      {/* Gray left accent bar */}
      <div
        className="flex-shrink-0 rounded-full self-stretch"
        style={{ width: 3, background: "var(--text-faint)", opacity: 0.45 }}
      />

      <div className="flex-1 min-w-0">
        <div
          className="text-[11px] font-medium leading-snug truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {event.subject}
        </div>
        <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: "var(--text-faint)" }}>
          {timeLabel}
        </div>
        {hovered && event.location?.displayName && (
          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-faint)" }}>
            {event.location.displayName}
          </div>
        )}
      </div>

      {/* + Task button — only on hover */}
      {hovered && (
        <button
          onClick={() => onCreateTask(event.subject, due)}
          className="flex-shrink-0 flex items-center justify-center rounded self-start mt-0.5 font-bold transition-colors"
          style={{
            width: 18,
            height: 18,
            fontSize: 13,
            lineHeight: 1,
            background: "var(--accent-fog)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-edge)",
          }}
          title={t("calendar.event.createTask")}
        >
          +
        </button>
      )}
    </div>
  );
}
