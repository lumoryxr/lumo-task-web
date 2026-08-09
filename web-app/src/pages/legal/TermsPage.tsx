import { LegalLayout } from "./LegalLayout";
import { TERMS_DOC } from "./content";

export function TermsPage() {
  return (
    <LegalLayout
      title={TERMS_DOC.title}
      effectiveDate={TERMS_DOC.effectiveDate}
      intro={TERMS_DOC.intro}
      sections={TERMS_DOC.sections}
    />
  );
}
