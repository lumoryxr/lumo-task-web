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
 * The root domain we own — the SINGLE place the primary domain is written on
 * the frontend. Every host below derives from it, so moving to a new domain (or
 * swapping a subdomain) is a one-line change here; nothing else hardcodes the
 * host. The live-site validation target is kept in lockstep with `SITE_URL` by
 * the `prod-validation-targets` standards test.
 */
export const ROOT_DOMAIN = "lumoryxr.com";

/** The web app / product home users open (marketing site is `web.<root>`). */
export const APP_HOST = `task.${ROOT_DOMAIN}`;

/**
 * The product's public home — where every shared card, QR code and brand
 * footer points. Shared screenshots are often the only trace of Lumo a new
 * person sees, so this must always be a domain we actually own (the cards
 * previously printed a `lumo.app` that goes nowhere).
 *
 * Self-hosters override it at build time with `VITE_SITE_URL` (inlined by Vite);
 * unset falls back to the operator's canonical domain below.
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL || `https://${APP_HOST}`
).replace(/\/+$/, "");

/** `SITE_URL` without the scheme — the form printed on share cards. */
export const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, "");

/**
 * Build the link encoded into a share card's QR code, tagged with the surface
 * it came from. The tag rides along as `?ref=` so we can tell which shared
 * artifact actually brings people back (weekly recap vs. pet level-up vs. …)
 * instead of guessing. Keep the values stable — they become analytics keys.
 */
export type ShareSurface =
  | "share-weekly"
  | "share-wrapped"
  | "share-streak"
  | "share-pet"
  | "share-recap";

export function shareLink(surface: ShareSurface): string {
  return `${SITE_URL}/?ref=${surface}`;
}

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
