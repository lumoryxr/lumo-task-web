import { LegalLayout } from "./LegalLayout";
import { PRIVACY_DOC } from "./content";

export function PrivacyPage() {
  return (
    <LegalLayout
      title={PRIVACY_DOC.title}
      effectiveDate={PRIVACY_DOC.effectiveDate}
      intro={PRIVACY_DOC.intro}
      sections={PRIVACY_DOC.sections}
    />
  );
}
