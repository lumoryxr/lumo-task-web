import { useT } from "@/i18n/useT";
import { IconArrowLeft, LumoGlyph } from "@/components/icons";
import { useIsMobile } from "@/hooks/useIsMobile";
import { WinControls } from "@/components/WinControls";

/**
 * Shared two-column layout for /login and /register.
 *
 * Desktop: Left hero (Lumo glyph + tagline) + Right scrollable form.
 * Mobile (≤639px): Hero hidden, form takes full width with scroll support.
 *
 * Used by `LoginPage` and `RegisterPage`. The Back button (top-left)
 * routes home when no explicit `onBack` is given.
 */
export function AuthShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const t = useT();
  const isMobile = useIsMobile();

  return (
    <div
      className="fixed inset-0 flex bg-base"
      style={{ overflowY: isMobile ? "auto" : "hidden" }}
    >
      <div className="lumo-pulse" />

      {/* Back button — only rendered when a caller supplies an explicit
          destination. Login is mandatory and the auth screen is the entry
          point, so there is no default "back" to fall through to. */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-[18px] left-[18px] z-[5] inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface text-text-secondary hover:bg-elevated hover:text-text-primary transition-colors"
          style={{ height: 32, padding: "0 12px 0 8px", fontSize: 12 }}
        >
          <IconArrowLeft size={14} />
          {t("auth.back")}
        </button>
      )}

      {/* Windows title-bar controls — only rendered in Electron */}
      <div className="absolute top-0 right-0 z-[5]">
        <WinControls height={48} />
      </div>

      {/* Hero panel: hidden on mobile to give full width to the form */}
      {!isMobile && <AuthHero />}

      {/* Form pane */}
      <div
        className="flex-1 min-w-0 flex justify-center"
        style={
          isMobile
            ? {
                alignItems: "flex-start",
                paddingTop: 72,
                paddingLeft: 20,
                paddingRight: 20,
                paddingBottom: 48,
              }
            : {
                alignItems: "center",
                padding: "32px 40px",
              }
        }
      >
        <div className="w-full" style={{ maxWidth: 340 }}>
          <div className="flex items-center justify-center gap-2.5 mb-[22px]">
            <LumoGlyph size={20} />
            <span className="text-[14px] font-semibold tracking-tight">
              {t("brand.name")}
              <span className="ml-0.5 font-normal text-text-faint">Task</span>
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthHero() {
  const t = useT();
  return (
    <div
      className="relative flex flex-col flex-shrink-0 overflow-hidden border-r border-border-faint"
      style={{
        width: 460,
        padding: 32,
        background: `
          radial-gradient(70% 70% at 30% 30%, rgba(61, 255, 160, 0.07), transparent 65%),
          radial-gradient(60% 60% at 80% 80%, rgba(91, 200, 212, 0.04), transparent 70%),
          linear-gradient(160deg, #0A100D 0%, #060908 100%)`,
      }}
    >
      {/* Decorative grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Centered visual */}
      <div className="relative flex-1 flex items-center justify-center">
        {/* Glow halo */}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: 360,
            height: 360,
            background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 60%)",
            animation: "lumoBreath 5s ease-in-out infinite",
          }}
        />
        {/* Progress ring */}
        <svg viewBox="0 0 260 260" className="relative z-[1]" style={{ width: 260, height: 260 }}>
          <defs>
            <linearGradient id="heroProgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-dim)" />
            </linearGradient>
          </defs>
          <circle cx="130" cy="130" r="110" fill="none" stroke="var(--border-default)" strokeWidth="1" opacity="0.6" />
          <circle
            cx="130"
            cy="130"
            r="110"
            fill="none"
            stroke="url(#heroProgGrad)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 110}
            strokeDashoffset={2 * Math.PI * 110 * 0.32}
            transform="rotate(-90 130 130)"
            style={{ filter: "drop-shadow(0 0 6px var(--accent-primary))" }}
          />
          <circle cx="130" cy="130" r="78" fill="none" stroke="var(--accent-edge)" strokeWidth="0.5" opacity="0.5" />
          <circle cx="130" cy="130" r="50" fill="none" stroke="var(--accent-edge)" strokeWidth="0.5" opacity="0.35" />
        </svg>

        {/* Centered "Now · 18:42" */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[2]">
          <div
            className="text-[10px] font-semibold uppercase mb-2 opacity-90"
            style={{ letterSpacing: "0.2em", color: "var(--accent-primary)" }}
          >
            Now
          </div>
          <div
            className="font-mono text-text-primary tabular-nums"
            style={{ fontSize: 44, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em" }}
          >
            18:42
          </div>
          <div
            className="text-[10px] font-medium uppercase mt-2.5 text-text-muted"
            style={{ letterSpacing: "0.12em" }}
          >
            2 / 4 · Q1
          </div>
        </div>
      </div>

      {/* Tagline */}
      <div className="relative z-[2]">
        <div
          className="font-medium text-text-primary leading-snug"
          style={{ fontSize: 18, letterSpacing: "-0.01em", textWrap: "pretty" }}
        >
          {t("auth.tagline")}
        </div>
        <div className="mt-3.5 flex gap-3.5 flex-wrap text-[11px] text-text-muted">
          {[t("auth.bullet.1"), t("auth.bullet.2"), t("auth.bullet.3")].map((line) => (
            <span key={line} className="inline-flex items-center gap-1.5">
              <span className="w-[3px] h-[3px] rounded-full" style={{ background: "var(--accent-primary)" }} />
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
