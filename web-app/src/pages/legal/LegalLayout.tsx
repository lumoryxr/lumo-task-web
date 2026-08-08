import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { IconArrowRight } from "@/components/icons";

/** A single policy section, authored in both locales. */
export interface LegalSection {
  heading: { en: string; zh: string };
  /** One or more paragraphs. */
  body: { en: string[]; zh: string[] };
}

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

        {/* Draft banner — this is a starting template, not legal advice. */}
        <div
          className="mt-4 rounded-lg border px-4 py-3 text-[12px] leading-relaxed text-text-secondary"
          style={{ borderColor: "var(--border-default)", background: "var(--bg-deep)" }}
        >
          {zh
            ? "说明：本文为起草模板，公开上线前需经法律顾问审阅，并补全公司主体名称、联系邮箱与所在司法辖区。"
            : "Note: this is a starting template. Before public launch, have it reviewed by legal counsel and fill in your company entity, contact email, and governing jurisdiction."}
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

        <div className="mt-10 border-t pt-4 text-[12px] text-text-muted" style={{ borderColor: "var(--border-faint)" }}>
          {zh
            ? "如对本政策有疑问，请通过 [填写联系邮箱] 与我们联系。"
            : "Questions about this policy? Contact us at [your-contact-email]."}
        </div>
      </div>
    </div>
  );
}
