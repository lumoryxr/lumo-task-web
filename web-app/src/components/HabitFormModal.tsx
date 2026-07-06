import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useModalA11y } from "@/hooks/useModalA11y";
import { Spinner } from "@/components/Spinner";
import type { Habit, HabitColor, HabitFrequency } from "@/types/task";

const COLORS: HabitColor[] = ["green", "cyan", "amber", "red", "purple"];

const COLOR_HEX: Record<HabitColor, string> = {
  green:  "var(--status-success)",
  cyan:   "var(--accent-primary)",
  amber:  "var(--status-warning)",
  red:    "var(--status-danger)",
  purple: "#a78bfa",
};

const FREQUENCIES: HabitFrequency[] = [
  "daily",
  "weekdays",
  "weekend",
  "days_of_week",
  "times_per_week",
  "interval",
];

// Sun=0 … Sat=6
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

interface FormState {
  title: string;
  emoji: string;
  color: HabitColor;
  frequency: HabitFrequency;
  frequencyDays: number[];
  frequencyTimes: number;
  frequencyInterval: number;
  note: string;
}

interface Props {
  habit?: Habit | null;
  onSave: (data: Omit<Habit, "id" | "createdAt">) => void | Promise<void>;
  onClose: () => void;
}

export function HabitFormModal({ habit, onSave, onClose }: Props) {
  const t = useT();
  const isEdit = !!habit;

  const [form, setForm] = useState<FormState>({
    title: habit?.title ?? "",
    emoji: habit?.emoji ?? "",
    color: habit?.color ?? "green",
    frequency: habit?.frequency ?? "daily",
    frequencyDays: habit?.frequencyDays ?? [],
    frequencyTimes: habit?.frequencyTimes ?? 3,
    frequencyInterval: habit?.frequencyInterval ?? 2,
    note: habit?.note ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      title: habit?.title ?? "",
      emoji: habit?.emoji ?? "",
      color: habit?.color ?? "green",
      frequency: habit?.frequency ?? "daily",
      frequencyDays: habit?.frequencyDays ?? [],
      frequencyTimes: habit?.frequencyTimes ?? 3,
      frequencyInterval: habit?.frequencyInterval ?? 2,
      note: habit?.note ?? "",
    });
    setErrors({});
  }, [habit]);

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = t("habit.form.error.title");
    else if (form.title.trim().length > 100) errs.title = t("habit.form.error.title.maxlen");
    if (form.note.trim().length > 500) errs.note = t("habit.form.error.note.maxlen");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      // Parent closes the modal on success; on failure it stays open so the
      // user can retry, hence resetting busy only in the catch.
      await onSave({
        title: form.title.trim(),
        emoji: form.emoji.trim() || undefined,
        color: form.color,
        frequency: form.frequency,
        frequencyDays: form.frequency === "days_of_week" ? form.frequencyDays : undefined,
        frequencyTimes: form.frequency === "times_per_week" ? form.frequencyTimes : undefined,
        frequencyInterval: form.frequency === "interval" ? form.frequencyInterval : undefined,
        note: form.note.trim() || undefined,
      });
    } catch {
      setBusy(false);
    }
  }

  function toggleDay(day: number) {
    setForm((f) => {
      const days = f.frequencyDays.includes(day)
        ? f.frequencyDays.filter((d) => d !== day)
        : [...f.frequencyDays, day];
      return { ...f, frequencyDays: days };
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-surface border border-border-faint shadow-2xl"
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-faint">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {isEdit ? t("habit.form.edit") : t("habit.form.new")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          >
            <IconClose size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              {t("habit.form.title")}
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("habit.form.title")}
              aria-label={t("habit.form.title")}
              className="w-full px-3 py-2 rounded-lg bg-elevated border border-border-faint text-[13px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-edge transition-colors"
            />
            {errors.title && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--status-danger)" }}>
                {errors.title}
              </p>
            )}
          </div>

          {/* Emoji */}
          <div className="flex-shrink-0 w-24">
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              {t("habit.form.emoji")}
            </label>
            <input
              value={form.emoji}
              onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
              placeholder="🔥"
              className="w-full px-3 py-2 rounded-lg bg-elevated border border-border-faint text-[18px] text-center outline-none focus:border-accent-edge transition-colors"
              maxLength={4}
            />
          </div>

          {/* Frequency type pills */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-2">
              {t("habit.form.frequency")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FREQUENCIES.map((freq) => {
                const on = form.frequency === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, frequency: freq }))}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border"
                    style={{
                      borderColor: on ? "var(--accent-edge)" : "var(--border-faint)",
                      background: on ? "var(--accent-fog)" : "var(--bg-elevated)",
                      color: on ? "var(--accent-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {t(`habit.freq.${freq}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-config for days_of_week */}
          {form.frequency === "days_of_week" && (
            <div>
              <div className="flex gap-1 justify-between">
                {WEEK_DAYS.map((day) => {
                  const on = form.frequencyDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all border"
                      style={{
                        borderColor: on ? "var(--accent-edge)" : "var(--border-faint)",
                        background: on ? "var(--accent-fog)" : "var(--bg-elevated)",
                        color: on ? "var(--accent-primary)" : "var(--text-muted)",
                      }}
                    >
                      {t(`habit.day.${["sun","mon","tue","wed","thu","fri","sat"][day]}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-config for times_per_week */}
          {form.frequency === "times_per_week" && (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-text-secondary flex-1">
                {t("habit.freq.times_per_week.label")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, frequencyTimes: Math.max(1, f.frequencyTimes - 1) }))}
                  className="w-7 h-7 rounded-full bg-elevated border border-border-faint text-text-primary text-[16px] flex items-center justify-center hover:bg-surface transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center text-[14px] font-semibold text-text-primary">
                  {form.frequencyTimes}
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, frequencyTimes: Math.min(7, f.frequencyTimes + 1) }))}
                  className="w-7 h-7 rounded-full bg-elevated border border-border-faint text-text-primary text-[16px] flex items-center justify-center hover:bg-surface transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Sub-config for interval */}
          {form.frequency === "interval" && (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-text-secondary flex-1">
                {t("habit.freq.interval.label")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, frequencyInterval: Math.max(2, f.frequencyInterval - 1) }))}
                  className="w-7 h-7 rounded-full bg-elevated border border-border-faint text-text-primary text-[16px] flex items-center justify-center hover:bg-surface transition-colors"
                >
                  −
                </button>
                <span className="w-6 text-center text-[14px] font-semibold text-text-primary">
                  {form.frequencyInterval}
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, frequencyInterval: Math.min(30, f.frequencyInterval + 1) }))}
                  className="w-7 h-7 rounded-full bg-elevated border border-border-faint text-text-primary text-[16px] flex items-center justify-center hover:bg-surface transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-2">
              {t("habit.form.color")}
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t(`habit.color.${c}`)}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    background: COLOR_HEX[c],
                    borderColor: form.color === c ? "var(--text-primary)" : "transparent",
                    transform: form.color === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              {t("habit.form.note")}
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-elevated border border-border-faint text-[13px] text-text-primary placeholder:text-text-faint outline-none focus:border-accent-edge transition-colors resize-none"
            />
            {errors.note && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--status-danger)" }}>
                {errors.note}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-[13px] font-medium text-text-secondary bg-elevated hover:bg-surface border border-border-faint transition-colors"
            >
              {t("habit.btn.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              aria-label={isEdit ? t("habit.form.save") : t("habit.form.create")}
              className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-text-inverse transition-opacity inline-flex items-center justify-center"
              style={{ background: "var(--accent-primary)", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? <Spinner size={15} /> : isEdit ? t("habit.form.save") : t("habit.form.create")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
