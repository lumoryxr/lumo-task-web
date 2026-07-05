import { useEffect, useRef, useState } from "react";
import { CountdownThemeArt } from "@/components/CountdownThemeArt";
import { IconEdit, IconRepeat, IconTrash } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { detectCountdownTheme } from "@/lib/countdownTheme";
import type { CountdownColor, CountdownEvent } from "@/types/task";
import { daysUntil, fmtDate } from "@/utils/countdown";

// ── Color tokens ──────────────────────────────────────────────────────────────

type ColorConfig = {
  primary: string;
  glow: string;
  fog: string;
  edge: string;
  gradient: string;
};

const COLOR_MAP: Record<CountdownColor, ColorConfig> = {
  green: {
    primary: "var(--accent-primary)",
    glow:    "rgba(61, 255, 160, 0.35)",
    fog:     "rgba(61, 255, 160, 0.07)",
    edge:    "rgba(61, 255, 160, 0.4)",
    gradient:"linear-gradient(135deg, rgba(61,255,160,0.15) 0%, rgba(61,255,160,0.04) 100%)",
  },
  cyan: {
    primary: "var(--status-info)",
    glow:    "rgba(91, 200, 212, 0.35)",
    fog:     "rgba(91, 200, 212, 0.07)",
    edge:    "rgba(91, 200, 212, 0.4)",
    gradient:"linear-gradient(135deg, rgba(91,200,212,0.15) 0%, rgba(91,200,212,0.04) 100%)",
  },
  amber: {
    primary: "var(--status-warning)",
    glow:    "rgba(255, 179, 71, 0.35)",
    fog:     "rgba(255, 179, 71, 0.07)",
    edge:    "rgba(255, 179, 71, 0.4)",
    gradient:"linear-gradient(135deg, rgba(255,179,71,0.15) 0%, rgba(255,179,71,0.04) 100%)",
  },
  red: {
    primary: "var(--status-urgent)",
    glow:    "rgba(255, 107, 107, 0.35)",
    fog:     "rgba(255, 107, 107, 0.07)",
    edge:    "rgba(255, 107, 107, 0.4)",
    gradient:"linear-gradient(135deg, rgba(255,107,107,0.15) 0%, rgba(255,107,107,0.04) 100%)",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface CountdownCardProps {
  event: CountdownEvent;
  locale: string;
  onEdit: (event: CountdownEvent) => void;
  onDelete: (id: string) => void;
}

export function CountdownCard({ event, locale, onEdit, onDelete }: CountdownCardProps) {
  const t = useT();
  const days = daysUntil(event.date, event.repeat, event.calendar);
  const c = COLOR_MAP[event.color];
  const theme = detectCountdownTheme(event);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isToday    = days === 0;
  const isTomorrow = days === 1;
  const isNear     = days > 0 && days <= 7;
  const isPast     = days < 0;

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // Animation class selection
  const pulseStyle = isToday
    ? { animation: "cdPulseRing 2s ease-in-out infinite", ["--cd-glow" as string]: c.glow }
    : isNear
    ? { animation: "cdPulseRing 3s ease-in-out infinite" }
    : {};

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${hovered || isToday ? c.edge : "var(--border-default)"}`,
        background: `color-mix(in srgb, var(--bg-elevated) 100%, transparent)`,
        overflow: "hidden",
        cursor: "default",
        transition: "box-shadow 0.2s, border-color 0.2s",
        boxShadow: hovered
          ? `0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px ${c.edge}, 0 0 18px ${c.glow}`
          : isToday
          ? `0 4px 16px rgba(0,0,0,0.35), 0 0 0 1px ${c.edge}, 0 0 18px ${c.glow}`
          : "var(--shadow-card)",
        ...pulseStyle,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tinted background gradient */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: c.gradient,
        pointerEvents: "none",
      }} />

      {/* Content-related themed motif (birthday cake, heart, plane, …) */}
      <CountdownThemeArt theme={theme} color={c.primary} />

      {/* Glow bar at top */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${c.primary}, transparent)`,
        opacity: hovered || isToday ? 1 : 0.4,
        transition: "opacity 0.2s",
      }} />

      {/* Content */}
      <div style={{ position: "relative", padding: "18px 16px 16px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {/* Emoji */}
          <div style={{
            fontSize: 28,
            lineHeight: 1,
            userSelect: "none",
            animation: isToday ? "cdFloat 2.5s ease-in-out infinite" : undefined,
          }}>
            {event.emoji || "📅"}
          </div>

          {/* Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: "20px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {event.title}
            </div>
            {event.note && (
              <div style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {event.note}
              </div>
            )}
          </div>

          {/* Menu button */}
          <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              aria-label={t("countdown.menu.open")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                width: 28, height: 28, borderRadius: "var(--radius-sm)",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: menuOpen ? "var(--bg-subtle)" : "transparent",
                border: "none", cursor: "pointer",
                color: "var(--text-muted)",
                transition: "background 120ms, color 120ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.2" />
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="8" cy="13" r="1.2" />
              </svg>
            </button>

            {menuOpen && (
              <div style={{
                position: "absolute", top: 32, right: 0, zIndex: 50,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lifted)",
                minWidth: 140,
                overflow: "hidden",
              }}>
                <button
                  onClick={() => { setMenuOpen(false); onEdit(event); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", background: "none", border: "none",
                    color: "var(--text-primary)", fontSize: 13, cursor: "pointer",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-subtle)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <IconEdit size={13} />
                  <span>{t("countdown.menu.edit")}</span>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(event.id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", background: "none", border: "none",
                    color: "var(--status-urgent)", fontSize: 13, cursor: "pointer",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,107,107,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <IconTrash size={13} />
                  <span>{t("countdown.menu.delete")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Big countdown number */}
        <div style={{
          marginTop: 20,
          marginBottom: 16,
          textAlign: "center",
        }}>
          {isToday ? (
            <div style={{
              fontSize: 26,
              fontWeight: 800,
              color: c.primary,
              textShadow: `0 0 24px ${c.glow}`,
              letterSpacing: "-0.02em",
            }}>
              {t("countdown.today")}
            </div>
          ) : (
            <div>
              <div style={{
                fontSize: isPast ? 40 : 56,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: isPast ? "var(--text-faint)" : c.primary,
                textShadow: isPast ? "none" : `0 0 32px ${c.glow}`,
                fontVariantNumeric: "tabular-nums",
                transition: "color 0.3s, text-shadow 0.3s",
              }}>
                {Math.abs(days)}
              </div>
              <div style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 500,
                color: isPast ? "var(--text-faint)" : "var(--text-secondary)",
                letterSpacing: "0.04em",
              }}>
                {isTomorrow ? t("countdown.tomorrow") : isPast ? t("countdown.days.ago") : t("countdown.days.left")}
              </div>
            </div>
          )}
        </div>

        {/* Footer meta — kept left-aligned so the bottom-right stays clear for
            the themed background motif (the repeat badge used to sit over it). */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          flexWrap: "wrap",
          gap: 8,
          paddingTop: 12,
          borderTop: "1px solid var(--border-faint)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {fmtDate(event.date, event.repeat, locale, event.calendar)}
            {event.calendar === "lunar" && (
              <span style={{
                fontSize: 9,
                color: "var(--text-secondary)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                padding: "1px 5px",
                letterSpacing: "0.04em",
                fontWeight: 500,
              }}>
                {t("countdown.badge.lunar")}
              </span>
            )}
          </span>
          {event.repeat === "yearly" && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 10, color: c.primary, opacity: 0.8,
              background: c.fog,
              border: `1px solid ${c.edge}`,
              borderRadius: "var(--radius-sm)",
              padding: "2px 6px",
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}>
              <IconRepeat size={10} />
              {t("countdown.repeat.yearly")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

