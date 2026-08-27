import { useCallback, useEffect, useRef, useState } from "react";
import { useToastStore, type Toast, type ToastType } from "@/store/useToastStore";
import { useT } from "@/i18n/useT";
import { useIsMobile } from "@/hooks/useIsMobile";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconError() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSuccess() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14.5 13.5H1.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4.5M8 5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Token maps ────────────────────────────────────────────────────────────────

const CONFIG: Record<ToastType, {
  icon: () => JSX.Element;
  borderColor: string;
  iconColor: string;
  bgColor: string;
  label: string;
}> = {
  error: {
    icon: IconError,
    borderColor: "var(--status-urgent)",
    iconColor: "var(--status-urgent)",
    bgColor: "rgba(255, 107, 107, 0.06)",
    label: "错误",
  },
  success: {
    icon: IconSuccess,
    borderColor: "var(--status-success)",
    iconColor: "var(--status-success)",
    bgColor: "rgba(168, 230, 75, 0.06)",
    label: "成功",
  },
  warning: {
    icon: IconWarning,
    borderColor: "var(--status-warning)",
    iconColor: "var(--status-warning)",
    bgColor: "rgba(255, 179, 71, 0.06)",
    label: "警告",
  },
  info: {
    icon: IconInfo,
    borderColor: "var(--status-info)",
    iconColor: "var(--status-info)",
    bgColor: "rgba(91, 200, 212, 0.06)",
    label: "提示",
  },
};

// ── Single toast ──────────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const cfg = CONFIG[toast.type];
  const Icon = cfg.icon;

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(enterTimer);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 260); // wait for exit animation
  }, [onDismiss]);

  useEffect(() => {
    if (toast.duration === 0) return;

    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
      if (elapsed < toast.duration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        handleDismiss();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [toast.duration, handleDismiss]);

  return (
    <div
      style={{
        transform: visible ? "translateX(0)" : "translateX(calc(100% + 24px))",
        opacity: visible ? 1 : 0,
        transition: "transform 0.26s var(--ease-enter), opacity 0.26s var(--ease-enter)",
        width: 320,
        background: `color-mix(in srgb, var(--bg-elevated) 100%, transparent)`,
        borderRadius: "var(--radius-md)",
        border: `1px solid var(--border-default)`,
        borderLeft: `3px solid ${cfg.borderColor}`,
        boxShadow: "var(--shadow-lifted)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Tinted background layer */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: cfg.bgColor,
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        padding: "12px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        {/* Icon */}
        <div style={{
          color: cfg.iconColor,
          flexShrink: 0,
          marginTop: 1,
          display: "flex",
        }}>
          <Icon />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: "18px",
            marginBottom: toast.message ? 3 : 0,
          }}>
            {toast.title}
          </div>
          {toast.message && (
            <div style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: "17px",
              wordBreak: "break-word",
            }}>
              {toast.message}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "background 120ms, color 120ms",
            marginTop: -2,
            marginRight: -4,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          aria-label={t("toast.dismiss")}
        >
          <IconClose />
        </button>
      </div>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          width: `${progress}%`,
          background: cfg.borderColor,
          opacity: 0.5,
          transition: "width 100ms linear",
        }} />
      )}
    </div>
  );
}

// ── Stack ─────────────────────────────────────────────────────────────────────

export function ToastStack() {
  const t = useT();
  const { toasts, dismiss } = useToastStore();
  const isMobile = useIsMobile();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        // On mobile, clear the fixed bottom tab bar (64px) + the device safe-area
        // inset so toasts aren't hidden behind it; desktop keeps the corner offset.
        bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom))" : 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
      aria-live="assertive"
      aria-label={t("toast.region")}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
