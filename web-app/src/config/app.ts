/**
 * App-wide static configuration — single source of truth for the project's
 * public links and contact channel. Referenced by the Account "Support" action
 * and by the legal documents (`pages/legal/content.ts`) so there is exactly one
 * place to update when these change.
 *
 * These are compile-time constants (never user input), so anywhere they feed an
 * <a href> there is no open-redirect / injection surface — the only requirement
 * is that outbound links carry rel="noopener noreferrer" (enforced by the
 * shared `ExternalLink` usage / the props at each call site).
 */

/** Canonical GitHub repository for the project. */
export const GITHUB_URL = "https://github.com/lumoryxr/lumo-task-web";

/**
 * Where "support / donate" sends people. Lumo is free; this is a voluntary
 * support link. Defaults to the repository (which surfaces the GitHub "Sponsor"
 * button via .github/FUNDING.yml). Point it straight at
 * https://github.com/sponsors/<user> once GitHub Sponsors is enabled.
 */
export const DONATE_URL = GITHUB_URL;

/** Primary contact/support channel for legal + privacy questions. */
export const CONTACT_URL = `${GITHUB_URL}/issues`;

/**
 * Optional public contact email. Empty by default — when set to a real inbox it
 * is shown alongside the GitHub contact in the legal footer. Kept blank rather
 * than a fake placeholder so nothing misleading ships.
 */
export const CONTACT_EMAIL = "";

/** How the operator is referred to in the legal documents. */
export const OPERATOR_NAME = "the Lumo maintainers";
