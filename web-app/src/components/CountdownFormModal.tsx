import { useEffect, useRef, useState } from "react";
import { IconClose } from "@/components/icons";
import { useT } from "@/i18n/useT";
import type { CountdownColor, CountdownEvent, CountdownRepeat } from "@/types/task";

const COLORS: { id: CountdownColor; label: string; primary: string; edge: string; bg: string }[] = [
  { id: "green",  label: "绿",  primary: "var(--accent-primary)",  edge: "rgba(61,255,160,0.5)",  bg: "rgba(61,255,160,0.1)" },
  { id: "cyan",   label: "青",  primary: "var(--status-info)",      edge: "rgba(91,200,212,0.5)",  bg: "rgba(91,200,212,0.1)" },
  { id: "amber",  label: "琥",  primary: "var(--status-warning)",   edge: "rgba(255,179,71,0.5)",  bg: "rgba(255,179,71,0.1)" },
  { id: "red",    label: "红",  primary: "var(--status-urgent)",    edge: "rgba(255,107,107,0.5)", bg: "rgba(255,107,107,0.1)" },
];

interface FormValues {
  title: string;
  date: string;
  emoji: string;
  color: CountdownColor;
  repeat: CountdownRepeat;
  note: string;
}

interface CountdownFormModalProps {
  event?: CountdownEvent | null;
  onSave: (values: Omit<CountdownEvent, "id" | "createdAt">) => void;
  onClose: () => void;
}

export function CountdownFormModal({ event, onSave, onClose }: CountdownFormModalProps) {
  const t = useT();
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

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!form.title.trim())         errs.title = t("countdown.form.error.title");
    else if (form.title.trim().length > 100) errs.title = t("countdown.form.error.title.maxlen");
    if (!form.date)                 errs.date  = t("countdown.form.error.date");
    if (form.note.length > 500)     errs.note  = t("countdown.form.error.note.maxlen");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      onSave({
        title:  form.title.trim(),
        date:   form.date,
        emoji:  form.emoji.trim() || undefined,
        color:  form.color,
        repeat: form.repeat,
        note:   form.note.trim() || undefined,
        // P1: countdowns are authored in the solar calendar; the lunar picker
        // arrives in P2. Editing preserves an event's existing calendar.
        calendar: event?.calendar ?? "solar",
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const isEdit = !!event;

  return (
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
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
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
                placeholder="新年快乐、我的生日…"
                style={inputStyle(!!errors.title)}
              />
              {errors.title && <FieldError msg={errors.title} />}
            </div>
          </div>

          {/* Date */}
          <div style={{ marginBottom: 16 }}>
            <Label text={t("countdown.form.date")} required />
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              style={{
                ...inputStyle(!!errors.date),
                colorScheme: "dark",
              }}
            />
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
                  title={c.label}
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
              placeholder="给自己写点什么…"
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
              style={{
                padding: "8px 20px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent-edge)",
                background: busy ? "var(--bg-subtle)" : "var(--accent-fog)",
                color: "var(--accent-primary)",
                fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer",
                transition: "background 120ms, opacity 120ms",
                opacity: busy ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.background = "rgba(61,255,160,0.18)"); }}
              onMouseLeave={(e) => { if (!busy) (e.currentTarget.style.background = "var(--accent-fog)"); }}
            >
              {isEdit ? t("countdown.form.save") : t("countdown.form.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
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
