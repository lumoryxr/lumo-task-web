import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowLeft, IconArrowRight, IconCheck } from "@/components/icons";
import { LumoGlyph } from "@/components/icons";
import { useAppStore, type Accent, type Density } from "@/store/useAppStore";
import { useAuthStore, selectIsSignedIn } from "@/store/useAuthStore";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/types/task";

/**
 * Onboarding — 4-step welcome → language → accent → density → done.
 *
 * Shown on first run (when `onboarded === false` in the app store).
 * "Skip" jumps straight to /today; "Continue" advances; the final step
 * routes to /matrix so users land somewhere productive.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const t = useT();
  const setOnboarded = useAppStore((s) => s.setOnboarded);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const [step, setStep] = useState(0);

  const steps: Array<{ key: string; node: React.ReactNode; sub: string; title: string }> = [
    {
      key: "welcome",
      title: t("onb.welcome.title"),
      sub: t("onb.welcome.sub"),
      node: <WelcomeStep />,
    },
    {
      key: "lang",
      title: t("onb.lang.title"),
      sub: t("onb.lang.sub"),
      node: <LangStep />,
    },
    {
      key: "accent",
      title: t("onb.accent.title"),
      sub: t("onb.accent.sub"),
      node: <AccentStep />,
    },
    {
      key: "density",
      title: t("onb.density.title"),
      sub: t("onb.density.sub"),
      node: <DensityStep />,
    },
    {
      key: "ready",
      title: t("onb.ready.title"),
      sub: t("onb.ready.sub"),
      node: <ReadyStep />,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  function finish() {
    setOnboarded(true);
    navigate(isSignedIn ? "/today" : "/login");
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(60% 50% at 50% 0%, var(--accent-fog), transparent 70%), var(--bg-base)",
      }}
    >
      <div className="lumo-pulse" />

      <div
        className="fade-in w-full overflow-hidden border rounded-[18px] bg-elevated"
        style={{
          maxWidth: 560,
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-lifted), 0 0 80px var(--accent-fog)",
        }}
      >
        {/* Top: progress + skip */}
        <div className="flex items-center gap-3 px-7 pt-6">
          <span className="lumo-glyph" style={{ width: 14, height: 14 }}>
            <span className="halo" />
            <span className="core" />
          </span>
          <div className="text-[11px] tracking-[0.18em] uppercase text-text-faint font-semibold">
            {t("onb.step")} {step + 1} / {steps.length}
          </div>
          <div className="flex-1 flex gap-1 ml-2">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-[2px] flex-1 rounded-full transition-colors"
                style={{
                  background:
                    i < step
                      ? "var(--accent-dim)"
                      : i === step
                        ? "var(--accent-primary)"
                        : "var(--border-default)",
                }}
              />
            ))}
          </div>
          <button
            className="text-[11px] text-text-muted hover:text-text-primary transition-colors"
            onClick={() => finish()}
          >
            {t("onb.skip")}
          </button>
        </div>

        {/* Body */}
        <div className="px-7 pt-8 pb-2">
          <div className="text-[22px] font-semibold tracking-tight text-text-primary leading-snug">
            {current.title}
          </div>
          <div className="mt-2 text-sm text-text-secondary leading-relaxed max-w-[440px]">
            {current.sub}
          </div>
          <div className="mt-7 min-h-[140px]">{current.node}</div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 px-7 py-4 mt-3 border-t border-border-faint">
          <button
            className="btn btn-ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{ opacity: step === 0 ? 0 : 1, pointerEvents: step === 0 ? "none" : "auto" }}
          >
            <IconArrowLeft size={14} />
            {t("onb.back")}
          </button>
          {isLast ? (
            <button className="btn btn-primary btn-lg" onClick={() => finish()}>
              <IconCheck size={14} />
              {t("onb.ready.cta")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
              {step === 0 ? t("onb.welcome.cta") : t("onb.next")}
              <IconArrowRight size={14} />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ── Steps ───────────────────────────────────────────────────────── */

function WelcomeStep() {
  return (
    <div className="flex items-center justify-center py-4">
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 100,
          height: 100,
          background:
            "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
        }}
      >
        <LumoGlyph size={56} />
      </div>
    </div>
  );
}

function LangStep() {
  const { locale, setLocale } = useAppStore();
  const options: Array<{ value: Locale; label: string; sub: string }> = [
    { value: "en", label: "English", sub: "Default UI language" },
    { value: "zh", label: "中文", sub: "界面与提示文案" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const on = locale === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setLocale(o.value)}
            className="flex flex-col items-start gap-1 p-4 rounded-lg border bg-surface text-left transition-all"
            style={{
              borderColor: on ? "var(--accent-edge)" : "var(--border-default)",
              boxShadow: on ? "0 0 0 2px var(--accent-fog)" : "none",
            }}
          >
            <div className="text-sm font-semibold text-text-primary">{o.label}</div>
            <div className="text-[11px] text-text-muted">{o.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function AccentStep() {
  const { accent, setAccent } = useAppStore();
  const t = useT();
  const options: Array<{ id: Accent; hex: string; label: string }> = [
    { id: "green", hex: "#3DFFA0", label: t("accent.green") },
    { id: "cyan", hex: "#38D4D4", label: t("accent.cyan") },
    { id: "amber", hex: "#FFAA44", label: t("accent.amber") },
    { id: "graphite", hex: "#A0ADB0", label: t("accent.graphite") },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const on = accent === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setAccent(o.id)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-surface text-left transition-all"
            style={{
              borderColor: on ? "var(--accent-edge)" : "var(--border-default)",
              boxShadow: on ? "0 0 0 2px var(--accent-fog)" : "none",
            }}
          >
            <span
              className="rounded-full flex-shrink-0"
              style={{
                width: 22,
                height: 22,
                background: o.hex,
                boxShadow: on ? `0 0 12px ${o.hex}` : "none",
              }}
            />
            <span className="text-sm text-text-primary">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DensityStep() {
  const { density, setDensity } = useAppStore();
  const t = useT();
  const options: Array<{ id: Density; label: string; sub: string }> = [
    {
      id: "comfortable",
      label: t("settings.density.comfy"),
      sub: t("onb.density.comfy.sub"),
    },
    {
      id: "compact",
      label: t("settings.density.compact"),
      sub: t("onb.density.compact.sub"),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const on = density === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setDensity(o.id)}
            className="flex flex-col items-start gap-1 p-4 rounded-lg border bg-surface text-left transition-all"
            style={{
              borderColor: on ? "var(--accent-edge)" : "var(--border-default)",
              boxShadow: on ? "0 0 0 2px var(--accent-fog)" : "none",
            }}
          >
            <div className="text-sm font-semibold text-text-primary">{o.label}</div>
            <div className="text-[11px] text-text-muted">{o.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function ReadyStep() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center py-4 gap-3">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 64,
          height: 64,
          background: "var(--accent-fog)",
          border: "1px solid var(--accent-edge)",
        }}
      >
        <IconCheck size={28} style={{ color: "var(--accent-primary)" }} />
      </div>
      <div className="text-[11px] text-text-faint">{t("onb.ready.saved")}</div>
    </div>
  );
}
