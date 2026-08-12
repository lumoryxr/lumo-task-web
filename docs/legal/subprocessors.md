# Subprocessors & Data Processing (DPA) — reference list

> ⚠️ **Draft reference · pending legal review (#472).** This lists the
> third-party services that may process **hosted-account** user data, plus a DPA
> starting point. It is an engineering-maintained inventory, **not legal advice**;
> the published subprocessor list and any signed DPA must be reviewed by counsel
> against the final company entity, jurisdiction, and billing model. Placeholders
> `{{COMPANY_ENTITY}}` / `{{CONTACT_EMAIL}}` / `{{GOVERNING_LAW}}` are replaced at
> publish time (same convention as `legal-drafts.md`).

## Scope

This applies to the **hosted account product only** (server-side sync). The
**local/desktop mode processes data on-device and uses no subprocessors** — keep
this distinction explicit in marketing copy (see
`landing-copy-reconciliation.md`, #472).

## Current subprocessors (hosted mode)

| Subprocessor | Purpose | Data categories | Notes |
|---|---|---|---|
| **Hosting** (Render) | Runs the backend + serves the frontend | All request data in transit; app data at rest via the DB below | Primary infra processor. Region per the service config. |
| **Turso** (libSQL) | Managed database (app data at rest) | Account records, tasks/habits/countdowns/projects, encrypted secret blobs | Secrets stored as AES-256-GCM `enc:v1` blobs; DB never sees plaintext AI/sync keys. |
| **Resend** | Transactional email | Email address + message content (verification, password reset, receipts) | Only engaged when `LUMO_EMAIL_PROVIDER=resend`; otherwise a dev outbox, no external send. |
| **GitHub** (OAuth) | "Sign in with GitHub" | OAuth identity (GitHub user id, requested scopes) | Only for users who choose GitHub sign-in; password login uses no third party. |
| **AI providers** (user-supplied) | Optional AI classify/parse features | The task text the user submits to the feature | **Keys are user-supplied and per-user encrypted**; the user chooses the provider. Not a global subprocessor — disclose as a user-directed transfer. |
| **Stripe** *(only when billing ships, #470)* | Payments / subscriptions | Billing identifiers, payment status (card data handled by Stripe, not stored by us) | **Not yet integrated** (0 payment code today). Add here the moment #470 lands. |

Monitoring/error-tracking (Sentry) and product analytics (Plausible/PostHog) are
**not yet integrated**; add them to this table as subprocessors the moment they
are enabled (they process telemetry / usage data), and reconcile with the
privacy policy + cookie notice (#471 / #475 / #472).

## DPA (Data Processing Agreement) — starting point

Enterprise customers will ask for a DPA. Before offering one:

1. **Confirm role.** For account holders' own data we are typically the
   **processor/service provider**; the customer is the controller. Confirm with
   counsel per jurisdiction.
2. **Reference this list.** A DPA's subprocessor schedule = the table above; keep
   them in sync (update this file → update the DPA schedule → notify per the
   change-notice clause).
3. **Minimum clauses to cover** (counsel to finalize): subject-matter & duration;
   nature & purpose of processing; data categories & data subjects; controller
   instructions; confidentiality; security measures (encryption at rest for
   secrets, TLS in transit, tenant isolation, access controls); **subprocessor
   authorization + change notice**; assistance with data-subject requests
   (export/delete already exist in-app); breach notification; deletion/return on
   termination; audit rights; international-transfer mechanism (e.g. SCCs) where
   applicable.
4. **Transfer mechanism.** If selling across borders, attach the appropriate
   mechanism (SCCs / local equivalent) — depends on `{{COMPANY_ENTITY}}` and
   `{{GOVERNING_LAW}}` (blocked on the entity decision in #470).

## Maintenance

- **This file is the source of truth for the subprocessor inventory.** When a new
  third party begins processing hosted user data, add a row **before** it goes
  live, and reconcile: privacy policy (`legal-drafts.md` / `PrivacyPage.tsx`),
  cookie/storage notice (#472), and the published subprocessor list.
- Contact for privacy/DPA requests: `{{CONTACT_EMAIL}}`.

## Related

- `docs/legal/legal-drafts.md` — ToS / Privacy draft (pending legal review, #472).
- `docs/legal/landing-copy-reconciliation.md` — desktop vs hosted "no tracking"
  reconciliation (#472).
- #470 — billing (adds Stripe as a subprocessor + drives entity/jurisdiction).
