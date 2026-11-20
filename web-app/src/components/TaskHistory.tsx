import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useHistoryStore } from "@/store/useHistoryStore";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { TaskTitle } from "@/components/TaskTitle";
import { IconCheck, IconChevronRight, IconClock, IconClose, IconProject, IconSearch, IconUndo } from "@/components/icons";
import { fmtDuration } from "@/lib/format";
import type { CompletedEntry, Locale } from "@/types/task";

const Q_CHIP: Record<string, string> = {
  Q1: "chip chip-q1",
  Q2: "chip chip-q2",
  Q3: "chip chip-q3",
  Q4: "chip chip-q4",
};

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtClock(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// ── Trigger ───────────────────────────────────────────────────────────────────

/**
 * A small, quiet "History" link. It loads nothing until clicked; the history
 * opens in a side drawer, so it never takes space on the page itself.
 */
export function TaskHistoryButton({ className = "" }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1 text-[11px] text-text-faint hover:text-text-primary transition-colors ${className}`}
      >
        <IconClock size={11} />
        {t("history.open")}
      </button>
      {open && <TaskHistoryDrawer onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

/** Closed tasks grouped by day in the home timeline's style, with their subtasks. */
export function TaskHistoryDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const entries = useHistoryStore((s) => s.entries);
  const nextCursor = useHistoryStore((s) => s.nextCursor);
  const loaded = useHistoryStore((s) => s.loaded);
  const loading = useHistoryStore((s) => s.loading);
  const loadingMore = useHistoryStore((s) => s.loadingMore);
  const error = useHistoryStore((s) => s.error);
  const load = useHistoryStore((s) => s.load);
  const loadMore = useHistoryStore((s) => s.loadMore);
  const projects = useProjectsStore((s) => s.projects);
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [query, setQuery] = useState("");

  // Fresh on every open, so tasks closed since last time show up.
  useEffect(() => {
    void load();
  }, [load]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? entries.filter((e) =>
        [ls(e.title), ...(e.subtasks ?? []).map((s) => s.title), ...(e.tags ?? [])]
          .some((text) => text.toLowerCase().includes(q)),
      )
    : entries;

  // Group by local calendar day, newest day first (entries arrive newest first).
  const groups: Array<{ key: string; label: string; items: CompletedEntry[] }> = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  for (const entry of visible) {
    const d = entry.completedAt ? new Date(entry.completedAt) : null;
    const key = d ? localDayKey(d) : "unknown";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const label = !d
        ? "—"
        : key === localDayKey(today)
          ? t("history.today")
          : key === localDayKey(yesterday)
            ? t("history.yesterday")
            : d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
                weekday: "short", month: "short", day: "numeric",
                ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}),
              });
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="fade-in absolute inset-0" style={{ background: "rgba(8,11,10,0.45)" }} onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-history-title"
        tabIndex={-1}
        className="relative h-full w-full max-w-[420px] flex flex-col border-l"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lifted)" }}
      >
        <header className="flex items-center gap-2 px-4 pt-4 pb-3">
          <IconClock size={14} className="text-text-faint" />
          <h2 id="task-history-title" className="flex-1 text-[15px] font-semibold text-text-primary">
            {t("history.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("history.close")}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-muted border border-border-default hover:bg-subtle hover:text-text-primary transition-colors"
          >
            <IconClose size={13} />
          </button>
        </header>

        <div className="px-4 pb-3">
          <label className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-faint)" }}>
            <IconSearch size={12} className="text-text-faint flex-shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("history.search")}
              aria-label={t("history.search")}
              className="flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-faint"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading && !loaded && (
            <p className="text-[12px] text-text-faint py-6 text-center" aria-live="polite">{t("history.loading")}</p>
          )}

          {loaded && entries.length === 0 && !error && (
            <p className="text-[12.5px] text-text-faint py-10 text-center">{t("history.empty")}</p>
          )}

          {loaded && entries.length > 0 && visible.length === 0 && (
            <p className="text-[12.5px] text-text-faint py-10 text-center">{t("history.noMatch")}</p>
          )}

          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`history-day-${group.key}`} className="mb-4">
              <h3
                id={`history-day-${group.key}`}
                className="sticky top-0 z-[1] flex items-baseline gap-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint"
                style={{ background: "var(--bg-elevated)" }}
              >
                {group.label}
                <span className="font-normal normal-case tracking-normal tabular-nums">
                  {t("history.dayCount").replace("{n}", String(group.items.length))}
                </span>
              </h3>
              <ol className="mt-1">
                {group.items.map((entry, i) => (
                  <HistoryItem
                    key={entry.id}
                    entry={entry}
                    isLast={i === group.items.length - 1}
                    projectName={entry.projectId ? projectName.get(entry.projectId) : undefined}
                    locale={locale}
                  />
                ))}
              </ol>
            </section>
          ))}

          {error && (
            <div className="py-4 text-center">
              <p className="text-[12px] text-text-faint mb-2">{t("history.error")}</p>
              <button
                type="button"
                onClick={() => void (loaded ? loadMore() : load())}
                className="rounded-md px-2.5 py-1 text-[11.5px] font-medium text-text-secondary border border-border-default hover:text-text-primary"
              >
                {t("history.retry")}
              </button>
            </div>
          )}

          {loaded && !q && !error && entries.length > 0 && (
            <div className="pt-1 text-center">
              {nextCursor ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-md px-3 py-1 text-[11.5px] font-medium text-text-secondary border border-border-default hover:text-text-primary disabled:opacity-60"
                >
                  {loadingMore ? t("history.loading") : t("history.loadMore")}
                </button>
              ) : (
                <span className="text-[11px] text-text-faint">{t("history.end")}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── One closed task ───────────────────────────────────────────────────────────

function HistoryItem({ entry, isLast, projectName, locale }: {
  entry: CompletedEntry;
  isLast: boolean;
  projectName?: string;
  locale: Locale;
}) {
  const t = useT();
  const ls = useLocaleString();
  const reopen = useHistoryStore((s) => s.reopen);
  const coarse = useCoarsePointer();
  const [expanded, setExpanded] = useState(false);
  const [reopening, setReopening] = useState(false);
  const subtasks = entry.subtasks ?? [];
  const done = subtasks.filter((s) => s.completed).length;
  const summary = t("history.subtasks").replace("{done}", String(done)).replace("{total}", String(subtasks.length));
  const title = ls(entry.title);
  const qChip = entry.quadrant ? Q_CHIP[entry.quadrant] : undefined;

  return (
    <li aria-label={title} className="group flex">
      <span className="w-[42px] flex-shrink-0 pt-[3px] text-right text-[11px] tabular-nums text-text-faint">
        {fmtClock(entry.completedAt, locale)}
      </span>
      <span className="flex flex-col items-center mx-2.5 flex-shrink-0" aria-hidden="true">
        <span
          className="mt-[5px] rounded-full"
          style={{ width: 9, height: 9, border: "2px solid var(--accent-primary)", background: "var(--bg-elevated)" }}
        />
        {!isLast && <span className="flex-1 w-px mt-1" style={{ background: "var(--border-default)", minHeight: 18 }} />}
      </span>
      <div className="flex-1 min-w-0" style={{ paddingBottom: isLast ? 2 : 12 }}>
        <div className="flex items-start gap-2">
          <span className="flex-1 min-w-0 text-[13px] font-medium leading-snug text-text-primary break-words">
            <TaskTitle text={title} />
          </span>
          <button
            type="button"
            disabled={reopening}
            onClick={async () => {
              setReopening(true);
              try {
                await reopen(entry.id);
              } finally {
                setReopening(false);
              }
            }}
            className={`flex-shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-text-faint hover:text-text-primary transition-opacity focus-visible:opacity-100 disabled:opacity-50 ${coarse ? "" : "opacity-0 group-hover:opacity-100"}`}
          >
            <IconUndo size={10} />
            {t("today.reopen")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-text-faint tabular-nums">
          {qChip && <span className={qChip} style={{ fontSize: 10, padding: "0 6px" }}>{entry.quadrant}</span>}
          {entry.duration > 0 && <span>{fmtDuration(entry.duration, locale)}</span>}
          {projectName && (
            <span className="inline-flex items-center gap-0.5 min-w-0">
              <IconProject size={10} />
              <span className="truncate max-w-[120px]">{projectName}</span>
            </span>
          )}
          {(entry.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>

        {subtasks.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors"
            >
              <span className="transition-transform" style={{ transform: expanded ? "rotate(90deg)" : "none" }} aria-hidden="true">
                <IconChevronRight size={11} strokeWidth={2} />
              </span>
              {summary}
            </button>
            {expanded && (
              <ul aria-label={summary} className="mt-1 ml-1 flex flex-col gap-1 border-l pl-2.5" style={{ borderColor: "var(--border-faint)" }}>
                {subtasks.map((s) => (
                  <li key={s.id} data-done={s.completed ? "true" : "false"} className="flex items-start gap-1.5 text-[12px] leading-snug">
                    <span
                      className="mt-[2px] flex-shrink-0 flex items-center justify-center rounded-[4px]"
                      style={{
                        width: 12, height: 12,
                        border: `1.5px solid ${s.completed ? "var(--accent-primary)" : "var(--border-strong)"}`,
                        background: s.completed ? "var(--accent-primary)" : "transparent",
                        color: "var(--text-inverse)",
                      }}
                      aria-hidden="true"
                    >
                      {s.completed && <IconCheck size={8} strokeWidth={3} />}
                    </span>
                    <span
                      className={s.completed ? "line-through" : ""}
                      style={{ color: s.completed ? "var(--text-faint)" : "var(--text-secondary)" }}
                    >
                      {s.title}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
