import { useT } from "@/i18n/useT";
import { IconCheck } from "@/components/icons";
import type { ProjectStage } from "@/types/task";

type StageState = "done" | "current" | "upcoming";

interface StageTrackProps {
  stages: ProjectStage[];
  /** The task's current stage id; null (or an id no longer in `stages`) = none. */
  currentId: string | null | undefined;
  /**
   * "full": a stepper with every stage labelled (detail view, project overview).
   * "compact": a one-line segment bar plus the current stage (task rows).
   */
  variant?: "full" | "compact";
  /** Makes the full track clickable; called with the picked stage id. */
  onSelect?: (stageId: string) => void;
  /** A save is in flight: stage buttons are disabled. */
  busy?: boolean;
  /** Optional per-stage counts shown under each label (full variant). */
  counts?: Record<string, number>;
}

function stateOf(index: number, currentIndex: number): StageState {
  if (currentIndex < 0) return "upcoming";
  if (index < currentIndex) return "done";
  return index === currentIndex ? "current" : "upcoming";
}

/**
 * A project's workflow stages in order, with the current one emphasised:
 * earlier stages read as done, later ones as upcoming. Shows every stage, so
 * the whole workflow is visible at a glance.
 */
export function StageTrack({ stages, currentId, variant = "full", onSelect, busy = false, counts }: StageTrackProps) {
  const t = useT();
  const currentIndex = stages.findIndex((s) => s.id === currentId);

  if (variant === "compact") {
    if (currentIndex < 0) return null;
    const current = stages[currentIndex];
    const label = t("stage.aria")
      .replace("{name}", current.name)
      .replace("{i}", String(currentIndex + 1))
      .replace("{n}", String(stages.length));
    return (
      <span
        role="img"
        aria-label={label}
        title={stages.map((s) => s.name).join(" → ")}
        className="inline-flex items-center gap-1.5 min-w-0"
      >
        <span className="inline-flex items-center gap-[3px] flex-shrink-0" aria-hidden="true">
          {stages.map((s, i) => {
            const state = stateOf(i, currentIndex);
            return (
              <span
                key={s.id}
                data-segment
                data-state={state}
                className="rounded-full"
                style={{
                  width: state === "current" ? 14 : 8,
                  height: 4,
                  background:
                    state === "upcoming"
                      ? "var(--border-default)"
                      : state === "done"
                        ? "color-mix(in srgb, var(--accent-primary) 45%, transparent)"
                        : "var(--accent-primary)",
                  boxShadow: state === "current" ? "0 0 6px var(--accent-glow)" : undefined,
                }}
              />
            );
          })}
        </span>
        <span className="truncate text-[11px] font-semibold" style={{ color: "var(--accent-primary)" }} aria-hidden="true">
          {current.name}
        </span>
        <span className="flex-shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--text-faint)" }} aria-hidden="true">
          {currentIndex + 1}/{stages.length}
        </span>
      </span>
    );
  }

  return (
    // Vertical padding keeps the current node's glow ring from being clipped by
    // the horizontal scroll container.
    <ol className="flex items-start w-full overflow-x-auto pt-2 pb-1" style={{ scrollbarWidth: "thin" }}>
      {stages.map((stage, i) => {
        const state = stateOf(i, currentIndex);
        const isCurrent = state === "current";
        const reached = state !== "upcoming";
        const node = (
          <span
            className="relative z-[1] flex items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition-all"
            style={{
              width: isCurrent ? 28 : 22,
              height: isCurrent ? 28 : 22,
              color: isCurrent ? "var(--text-inverse)" : state === "done" ? "var(--accent-primary)" : "var(--text-faint)",
              background: isCurrent ? "var(--accent-primary)" : state === "done" ? "var(--accent-fog)" : "var(--bg-subtle)",
              border: `1.5px solid ${reached ? "var(--accent-primary)" : "var(--border-default)"}`,
              boxShadow: isCurrent ? "0 0 0 4px var(--accent-dim), 0 0 14px var(--accent-glow)" : undefined,
            }}
          >
            {state === "done" ? <IconCheck size={11} strokeWidth={2.5} /> : i + 1}
          </span>
        );

        return (
          <li
            key={stage.id}
            data-state={state}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex-1 min-w-[52px] flex flex-col items-center text-center px-1"
          >
            {/* Connector to the previous stage, lit once this stage is reached. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-[13px] h-[2px] rounded-full"
                style={{
                  left: "calc(-50% + 14px)",
                  right: "calc(50% + 14px)",
                  background: reached ? "var(--accent-primary)" : "var(--border-default)",
                  opacity: reached ? 0.75 : 1,
                }}
              />
            )}
            <span className="flex items-center justify-center h-[28px]">
              {onSelect ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={isCurrent}
                  aria-label={(isCurrent ? t("stage.current") : t("stage.set")).replace("{name}", stage.name)}
                  title={stage.name}
                  onClick={() => { if (!isCurrent) onSelect(stage.id); }}
                  className="rounded-full disabled:opacity-60 hover:scale-110 transition-transform"
                  style={{ cursor: isCurrent ? "default" : "pointer" }}
                >
                  {node}
                </button>
              ) : (
                node
              )}
            </span>
            <span
              className="mt-1.5 w-full truncate text-[11.5px] leading-tight"
              style={{
                color: isCurrent ? "var(--accent-primary)" : state === "done" ? "var(--text-secondary)" : "var(--text-faint)",
                fontWeight: isCurrent ? 700 : 500,
              }}
              title={stage.name}
            >
              {stage.name}
            </span>
            {counts && (
              <span className="mt-0.5 text-[10.5px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                {t("stage.count").replace("{n}", String(counts[stage.id] ?? 0))}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
