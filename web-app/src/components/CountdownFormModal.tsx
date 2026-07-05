import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalA11y } from "@/hooks/useModalA11y";
import { IconClose } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { useT } from "@/i18n/useT";
import type {
  CountdownCalendar,
  CountdownColor,
  CountdownEvent,
  CountdownRepeat,
} from "@/types/task";
import {
  LUNAR_MAX_YEAR,
  LUNAR_MIN_YEAR,
  type LunarParts,
  lunarDayLabel,
  lunarLeapMonth,
  lunarMonthOptions,
  lunarSelectableDays,
  lunarToSolarISO,
  solarISOToLunar,
} from "@/utils/lunar";

const COLORS: { id: CountdownColor; labelKey: string; primary: string; edge: string; bg: string }[] = [
  { id: "green",  labelKey: "habit.color.green", primary: "var(--accent-primary)",  edge: "rgba(61,255,160,0.5)",  bg: "rgba(61,255,160,0.1)" },
  { id: "cyan",   labelKey: "habit.color.cyan",  primary: "var(--status-info)",      edge: "rgba(91,200,212,0.5)",  bg: "rgba(91,200,212,0.1)" },
  { id: "amber",  labelKey: "habit.color.amber", primary: "var(--status-warning)",   edge: "rgba(255,179,71,0.5)",  bg: "rgba(255,179,71,0.1)" },
  { id: "red",    labelKey: "habit.color.red",   primary: "var(--status-urgent)",    edge: "rgba(255,107,107,0.5)", bg: "rgba(255,107,107,0.1)" },
];

interface FormValues {
  title: string;
  date: string;
  emoji: string;
  color: CountdownColor;
  repeat: CountdownRepeat;
  note: string;
  calendar: CountdownCalendar;
}

interface CountdownFormModalProps {
  event?: CountdownEvent | null;
  onSave: (values: Omit<CountdownEvent, "id" | "createdAt">) => void | Promise<void>;
  onClose: () => void;
}

export function CountdownFormModal({ event, onSave, onClose }: CountdownFormModalProps) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const todayRef = useRef(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<FormValues>({
    title:  event?.title  ?? "",
    date:   event?.date   ?? todayRef.current,
    emoji:  event?.emoji  ?? "",
    color:  event?.color  ?? "green",
    repeat: event?.repeat ?? "none",
    note:   event?.note   ?? "",
    calendar: event?.calendar ?? "solar",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  useEffect(() => {
    setForm({
      title:  event?.title  ?? "",
      date:   event?.date   ?? todayRef.current,
      emoji:  event?.emoji  ?? "",
      color:  event?.color  ?? "green",
      repeat: event?.repeat ?? "none",
      note:   event?.note   ?? "",
      calendar: event?.calendar ?? "solar",
    });
    setErrors({});
  }, [event]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // ── Calendar / lunar picker ───────────────────────────────────────────────
  // `form.date` is always the solar anchor. In lunar mode the picker's selected
  // values are derived from it, and any picker change converts back to a solar
  // anchor — so the lunar UI never introduces a second source of truth.
  const lunarSel = form.calendar === "lunar" ? solarISOToLunar(form.date) : null;

  function switchCalendar(cal: CountdownCalendar) {
    if (cal === form.calendar) return;
    // Going lunar with an anchor outside the supported range would leave the
    // picker without a valid selection — snap to today (always in range).
    const date = cal === "lunar" && !solarISOToLunar(form.date) ? todayRef.current : form.date;
    setForm((f) => ({ ...f, calendar: cal, date }));
    setErrors((e) => ({ ...e, date: undefined }));
  }

  /** Write a lunar selection back as a solar anchor, clamping leap + day. */
  function applyLunar(lYear: number, lMonth: number, lDay: number, isLeap: boolean) {
    const leap = isLeap && lunarLeapMonth(lYear) === lMonth;
    const maxDay = lunarSelectableDays(lYear, lMonth, leap) || lDay;
    const day = Math.min(lDay, maxDay);
    const iso = lunarToSolarISO(lYear, lMonth, day, leap);
    if (iso) {
      setForm((f) => ({ ...f, date: iso }));
      setErrors((e) => ({ ...e, date: undefined }));
    }
  }

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.title.trim())         errs.title = t("countdown.form.error.title");
    else if (form.title.trim().length > 100) errs.title = t("countdown.form.error.title.maxlen");
    if (!form.date)                 errs.date  = t("countdown.form.error.date");
    else if (form.calendar === "lunar" && !solarISOToLunar(form.date)) {
      errs.date = t("countdown.form.error.lunar.range");
    }
    if (form.note.length > 500)     errs.note  = t("countdown.form.error.note.maxlen");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    try {
      // Await the round-trip so the button shows a spinner and the modal only
      // closes once the event is actually saved; on failure it stays open.
      await onSave({
        title:  form.title.trim(),
        date:   form.date,
        emoji:  form.emoji.trim() || undefined,
        color:  form.color,
        repeat: form.repeat,
        note:   form.note.trim() || undefined,
        calendar: form.calendar,
      });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  const isEdit = !!event;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-faint)",
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {isEdit ? t("countdown.form.edit") : t("countdown.form.new")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("qc.close")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "var(--radius-sm)",
              background: "transparent", border: "none",
              color: "var(--text-muted)", cursor: "pointer",
              transition: "background 120ms, color 120ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px" }}>
          {/* Title + Emoji row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {/* Emoji */}
            <div style={{ flexShrink: 0 }}>
              <Label text={t("countdown.form.emoji")} />
              <input
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                placeholder="🎂"
                maxLength={4}
                style={{
                  width: 52, height: 40,
                  textAlign: "center",
                  fontSize: 22,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                  outline: "none",
                  cursor: "text",
                }}
              />
            </div>
            {/* Title */}
            <div style={{ flex: 1 }}>
              <Label text={t("countdown.form.title")} required />
              <input
                ref={inputRef}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={t("countdown.form.title.ph")}
                aria-label={t("countdown.form.title")}
                style={inputStyle(!!errors.title)}
              />
              {errors.title && <FieldError msg={errors.title} />}
            </div>
          </div>

          {/* Calendar toggle */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("countdown.form.calendar")} />
            <div role="radiogroup" aria-label={t("countdown.form.calendar")}
                 style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["solar", "lunar"] as CountdownCalendar[]).map((cal) => (
                <button
                  key={cal}
                  type="button"
                  role="radio"
                  aria-checked={form.calendar === cal}
                  onClick={() => switchCalendar(cal)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: form.calendar === cal
                      ? "1px solid var(--accent-edge)"
                      : "1px solid var(--border-default)",
                    background: form.calendar === cal ? "var(--accent-fog)" : "var(--bg-subtle)",
                    color: form.calendar === cal ? "var(--accent-primary)" : "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  {cal === "solar" ? t("countdown.cal.solar") : t("countdown.cal.lunar")}
                </button>
              ))}
            </div>
          </div>

          {/* Date — solar input or lunar picker */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("countdown.form.date")} required />
            {form.calendar === "solar" ? (
              <input
                type="date"
                aria-label={t("countdown.form.date")}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                style={{
                  ...inputStyle(!!errors.date),
                  colorScheme: "dark",
                }}
              />
            ) : (
              <LunarPicker
                sel={lunarSel}
                onChange={applyLunar}
                labels={{
                  year: t("countdown.form.lunar.year"),
                  month: t("countdown.form.lunar.month"),
                  day: t("countdown.form.lunar.day"),
                  rangeError: t("countdown.form.error.lunar.range"),
                }}
              />
            )}
            {errors.date && <FieldError msg={errors.date} />}
          </div>

          {/* Color */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("countdown.form.color")} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set("color", c.id)}
                  title={t(c.labelKey)}
                  style={{
                    width: 32, height: 32,
                    borderRadius: "50%",
                    border: form.color === c.id
                      ? `2px solid ${c.primary}`
                      : "2px solid var(--border-default)",
                    background: form.color === c.id ? c.bg : "var(--bg-subtle)",
                    boxShadow: form.color === c.id ? `0 0 0 3px ${c.edge}` : "none",
                    cursor: "pointer",
                    transition: "box-shadow 150ms, border-color 150ms",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: c.primary,
                    boxShadow: form.color === c.id ? `0 0 6px ${c.primary}` : "none",
                  }} />
                </button>
              ))}
            </div>
          </div>

          {/* Repeat */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("countdown.form.repeat")} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {(["none", "yearly"] as CountdownRepeat[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("repeat", r)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "var(--radius-sm)",
                    border: form.repeat === r
                      ? "1px solid var(--accent-edge)"
                      : "1px solid var(--border-default)",
                    background: form.repeat === r ? "var(--accent-fog)" : "var(--bg-subtle)",
                    color: form.repeat === r ? "var(--accent-primary)" : "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  {r === "none" ? t("countdown.repeat.none") : t("countdown.repeat.yearly")}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div style={{ marginBottom: 24 }}>
            <Label text={t("countdown.form.note")} />
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder={t("countdown.form.note.ph")}
              rows={2}
              style={{
                ...inputStyle(false),
                resize: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-subtle)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {t("countdown.btn.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-label={isEdit ? t("countdown.form.save") : t("countdown.form.create")}
              style={{
                padding: "8px 20px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent-edge)",
                background: busy ? "var(--bg-subtle)" : "var(--accent-fog)",
                color: "var(--accent-primary)",
                fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                transition: "background 120ms, opacity 120ms",
                opacity: busy ? 0.6 : 1,
                minWidth: 72, display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.background = "rgba(61,255,160,0.18)"); }}
              onMouseLeave={(e) => { if (!busy) (e.currentTarget.style.background = "var(--accent-fog)"); }}
              aria-busy={busy}
            >
              {busy ? <Spinner /> : isEdit ? t("countdown.form.save") : t("countdown.form.create")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600,
      color: "var(--text-secondary)",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      marginBottom: 6,
    }}>
      {text}{required && <span style={{ color: "var(--status-urgent)", marginLeft: 2 }}>*</span>}
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: 11, color: "var(--status-urgent)", marginTop: 4 }}>{msg}</div>
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: 40,
    padding: "0 12px",
    background: "var(--bg-subtle)",
    border: `1px solid ${hasError ? "var(--status-urgent)" : "var(--border-default)"}`,
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    transition: "border-color 150ms",
    boxSizing: "border-box",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    ...inputStyle(false),
    flex: 1,
    padding: "0 8px",
    cursor: "pointer",
    colorScheme: "dark",
  };
}

// ── Lunar date picker (年 / 月 / 日, leap-aware) ─────────────────────────────────

// The selectable lunar years are a fixed span — build the list once, not per render.
const LUNAR_YEARS: number[] = Array.from(
  { length: LUNAR_MAX_YEAR - LUNAR_MIN_YEAR + 1 },
  (_, i) => LUNAR_MIN_YEAR + i,
);

interface LunarPickerProps {
  sel: LunarParts | null;
  onChange: (lYear: number, lMonth: number, lDay: number, isLeap: boolean) => void;
  labels: { year: string; month: string; day: string; rangeError: string };
}

function LunarPicker({ sel, onChange, labels }: LunarPickerProps) {
  if (!sel) {
    // Defensive: an unconvertible anchor; the field-level error is shown above.
    return <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{labels.rangeError}</div>;
  }

  const months = lunarMonthOptions(sel.lYear);
  // Offer only days that actually convert (trims the leap-month day-30 quirk).
  const dayCount = lunarSelectableDays(sel.lYear, sel.lMonth, sel.isLeap) || 30;
  const monthValue = `${sel.lMonth}:${sel.isLeap ? 1 : 0}`;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        aria-label={labels.year}
        value={sel.lYear}
        onChange={(e) => onChange(Number(e.target.value), sel.lMonth, sel.lDay, sel.isLeap)}
        style={selectStyle()}
      >
        {LUNAR_YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        aria-label={labels.month}
        value={monthValue}
        onChange={(e) => {
          const [m, leap] = e.target.value.split(":");
          onChange(sel.lYear, Number(m), sel.lDay, leap === "1");
        }}
        style={selectStyle()}
      >
        {months.map((m) => (
          <option key={`${m.lMonth}:${m.isLeap ? 1 : 0}`} value={`${m.lMonth}:${m.isLeap ? 1 : 0}`}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        aria-label={labels.day}
        value={sel.lDay}
        onChange={(e) => onChange(sel.lYear, sel.lMonth, Number(e.target.value), sel.isLeap)}
        style={selectStyle()}
      >
        {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{lunarDayLabel(d)}</option>
        ))}
      </select>
    </div>
  );
}
