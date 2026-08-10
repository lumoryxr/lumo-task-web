import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { IconArrowRight } from "@/components/icons";
import type { LegalSection } from "./content";

// Re-exported so existing importers of `LegalSection` from this module keep working.
export type { LegalSection } from "./content";

/**
 * Shared full-screen layout for the standalone legal pages (Privacy, Terms).
 * These render outside the app Shell so they are reachable when signed out
 * (e.g. from the registration consent line and the marketing footer).
 *
 * Content is authored bilingually and selected by the active locale rather than
 * routed through `strings.ts`, to keep long-form prose out of the key table
 * (the i18n parity guard covers UI keys; visible prose is out of its scope).
 */
export function LegalLayout({
  title,
  effectiveDate,
  intro,
  sections,
}: {
  title: { en: string; zh: string };
  effectiveDate: string;
  intro: { en: string; zh: string };
  sections: LegalSection[];
}) {
  const navigate = useNavigate();
  const locale = useAppStore((s) => s.locale);
  const zh = locale === "zh";
  const pick = (v: { en: string; zh: string }) => (zh ? v.zh : v.en);

  return (
    <div className="fade-in min-h-screen bg-base text-text-primary">
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <IconArrowRight size={13} style={{ transform: "rotate(180deg)" }} />
          {zh ? "返回" : "Back"}
        </button>

        <h1 className="text-2xl font-semibold text-text-primary" style={{ letterSpacing: "-0.01em" }}>
          {pick(title)}
        </h1>
        <div className="mt-1 text-[12px] text-text-muted">
          {zh ? "生效日期" : "Effective date"}: {effectiveDate}
        </div>

        <p className="mt-6 text-[14px] leading-relaxed text-text-secondary">{pick(intro)}</p>

        {sections.map((s, i) => (
          <section key={i} className="mt-7">
            <h2 className="text-[15px] font-semibold text-text-primary">
              {i + 1}. {pick(s.heading)}
            </h2>
            {(zh ? s.body.zh : s.body.en).map((para, j) => (
              <p key={j} className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">
                {para}
              </p>
            ))}
          </section>
        ))}

      </div>
    </div>
  );
}
