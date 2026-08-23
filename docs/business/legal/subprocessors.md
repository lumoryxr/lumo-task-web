# Third-party services & data (open-source personal project)

> **Lumo is a free, open-source personal project — not a company.** This page is
> an honest inventory of the third-party services that may process data for the
> **hosted account** (the version where you sign in and sync). It is a
> transparency note to back the Privacy Policy, **not** a commercial "DPA /
> subprocessor agreement" — there is no legal entity, no enterprise contracts,
> and no billing here.

## Scope

Applies to the **hosted account only** (server-side sync). The **local / desktop
mode keeps data on your device and uses none of these services** — nothing is
uploaded unless you enable sync. Keep that distinction accurate in any
description of the project.

## Services the hosted account uses

| Service | Why | What it sees |
|---|---|---|
| **Hosting** (e.g. a VPS, or Render for the test environment) | Runs the backend + serves the app | Request data in transit; app data at rest via the database below |
| **Turso** (libSQL) | Managed database — app data at rest | Account records, tasks/habits/countdowns/projects, and encrypted secret blobs |
| **Resend** | Transactional email (verification, password reset) | Email address + message content — only when email is configured; otherwise a dev outbox sends nothing externally |
| **GitHub** (OAuth) | Optional "Sign in with GitHub" | OAuth identity (GitHub user id, requested scopes) — only if you choose it; password login uses no third party |
| **AI provider** (you supply the key) | Optional AI features | The task text you submit to the feature. The key is **yours**, stored encrypted per-user, and the provider is your choice — disclosed as a user-directed transfer, not a project-wide processor |

Notes:
- Secrets (your AI key, any sync tokens) are stored as AES-256-GCM `enc:v1`
  blobs — the database never sees them in plaintext, and the API never returns
  them (only `hasKey: boolean`).
- **No payment processor** (no Stripe/etc.) — the project takes no payments.
- **No analytics / ad-tracking / cross-site trackers** are used. If any error
  reporting or analytics is ever added, add it to this table first and update the
  Privacy Policy.

## Keeping it honest

- This file is the transparency source for "what third parties touch hosted
  data." If a new service starts processing hosted user data, **add a row before
  it goes live** and reconcile the Privacy Policy
  (`web-app/src/pages/legal/content.ts`).
- Contact for privacy questions: the project's GitHub issues (see
  `OPERATOR_NAME` / contact in `web-app/src/config/app.ts`). No company address.

## Related

- [`legal-drafts.md`](./legal-drafts.md) — plain-language overview of the ToS /
  Privacy notices.
- [`landing-copy-reconciliation.md`](./landing-copy-reconciliation.md) — keeping
  "local-first, no tracking" marketing claims accurate for desktop vs hosted.
