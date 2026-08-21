/**
 * Single source of truth for the domains this marketing site references.
 *
 * The app link lived in four components (Nav, Hero, CTA, Footer), each with its
 * own hardcoded host — change the domain and you had to touch every one. It
 * lives here now: edit `ROOT_DOMAIN` (or a subdomain below) once and every
 * "Open app" button follows.
 *
 * The site's OWN domain (`web.<root>`) is set in two deploy-level places that
 * can't import this module — `astro.config.mjs` (`site`) and `public/CNAME` —
 * so keep those in step with `SITE_DOMAIN` when the root changes.
 */
export const ROOT_DOMAIN = "lumoryxr.com";

/** The web app users open from the marketing site. */
export const APP_URL = `https://task.${ROOT_DOMAIN}`;

/** Where this marketing site itself is served (mirror in astro.config + CNAME). */
export const SITE_DOMAIN = `web.${ROOT_DOMAIN}`;
