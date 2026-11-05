import type { CSSProperties, KeyboardEvent } from "react";
import { useT } from "@/i18n/useT";
import { IconCheck } from "@/components/icons";
import { clampProgress, progressFromSubtasks, PROGRESS_PRESETS } from "@/lib/progress";
import type { Subtask } from "@/types/task";

/** State color: accent while in progress, success once done. */
function progressColor(pct: number): string {
  return pct >= 100 ? "var(--status-success)" : "var(--accent-primary)";
}

function progressVars(pct: number): CSSProperties {
  return { "--pct": pct, "--progress-color": progressColor(pct) } as CSSProperties;
}

// ── Read-only bar ─────────────────────────────────────────────────────────────

interface TaskProgressBarProps {
  value: number | undefined;
  /** "sm" fits a meta line (task rows, matrix cards); "md" fills its container. */
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

/** Compact completion bar with an optional "NN%" label. */
export function TaskProgressBar({ value, size = "sm", showLabel = true, className = "" }: TaskProgressBarProps) {
  const t = useT();
  const pct = clampProgress(value);
  const done = pct >= 100;
  const label = t("progress.aria").replace("{n}", String(pct));

  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      title={label}
      data-complete={done ? "true" : "false"}
      className={`inline-flex items-center gap-1.5 ${size === "md" ? "w-full" : ""} ${className}`}
      style={progressVars(pct)}
    >
      <span
        className={`progress-track ${size === "md" ? "flex-1" : "flex-shrink-0"}`}
        style={{ width: size === "md" ? undefined : 48, height: size === "md" ? 6 : 4 }}
      >
        <span className="progress-fill" />
      </span>
      {showLabel && (
        <span
          className="flex-shrink-0 tabular-nums font-semibold leading-none"
          style={{ fontSize: size === "md" ? 12 : 10.5, color: done ? "var(--status-success)" : "var(--text-secondary)" }}
        >
          {pct}%
        </span>
      )}
    </span>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

/** Keys that move a range input; releasing one of these is a finished edit. */
const VALUE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

interface TaskProgressEditorProps {
  value: number;
  /** Live value while dragging, typing, or picking a preset. */
  onChange: (value: number) => void;
  /**
   * Fired when an edit is finished (slider released, key released, preset or
   * subtask shortcut clicked). Omit it when the value is saved with a form.
   */
  onCommit?: (value: number) => void;
  /** Offers a "match subtasks" shortcut when they disagree with the value. */
  subtasks?: Subtask[];
  /** A save is in flight: inputs are disabled and a saving hint is shown. */
  busy?: boolean;
}

/** Completion editor: large readout, slider, quarter presets, subtask shortcut. */
export function TaskProgressEditor({ value, onChange, onCommit, subtasks, busy = false }: TaskProgressEditorProps) {
  const t = useT();
  const pct = clampProgress(value);
  const color = progressColor(pct);
  const fromSubtasks = progressFromSubtasks(subtasks);
  const status = pct >= 100 ? t("progress.done") : pct > 0 ? t("progress.inProgress") : t("progress.notStarted");

  function setAndCommit(next: number) {
    const v = clampProgress(next);
    onChange(v);
    onCommit?.(v);
  }

  function handleKeyUp(e: KeyboardEvent<HTMLInputElement>) {
    if (VALUE_KEYS.has(e.key)) onCommit?.(pct);
  }

  return (
    <div className="flex flex-col gap-2.5" style={progressVars(pct)}>
      {/* Readout */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
            }}
          >
            {pct >= 100 && <IconCheck size={10} strokeWidth={2.5} />}
            {status}
          </span>
          {busy && (
            <span className="text-[11px]" style={{ color: "var(--text-faint)" }} aria-live="polite">
              {t("progress.saving")}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-0.5 tabular-nums leading-none" aria-hidden="true">
          <span className="font-semibold" style={{ fontSize: 26, color, letterSpacing: "-0.02em" }}>
            {pct}
          </span>
          <span className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>%</span>
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={busy}
        aria-label={t("progress.label")}
        aria-valuetext={`${pct}%`}
        className="progress-range"
        onChange={(e) => onChange(clampProgress(Number(e.target.value)))}
        onPointerUp={() => onCommit?.(pct)}
        onKeyUp={handleKeyUp}
      />

      {/* Presets + subtask shortcut */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PROGRESS_PRESETS.map((p) => {
          const active = p === pct;
          return (
            <button
              key={p}
              type="button"
              disabled={busy}
              aria-pressed={active}
              aria-label={t("progress.preset").replace("{n}", String(p))}
              onClick={() => setAndCommit(p)}
              className="rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition-colors disabled:opacity-50"
              style={{
                color: active ? "var(--text-inverse)" : "var(--text-secondary)",
                background: active ? color : "var(--bg-subtle)",
                border: `1px solid ${active ? color : "var(--border-default)"}`,
              }}
            >
              {p}%
            </button>
          );
        })}
        {fromSubtasks !== null && fromSubtasks !== pct && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAndCommit(fromSubtasks)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
            style={{
              color: "var(--accent-primary)",
              background: "var(--accent-fog)",
              border: "1px solid var(--accent-edge)",
            }}
          >
            <IconCheck size={10} strokeWidth={2} />
            {t("progress.matchSubtasks").replace("{n}", String(fromSubtasks))}
          </button>
        )}
      </div>
    </div>
  );
}
