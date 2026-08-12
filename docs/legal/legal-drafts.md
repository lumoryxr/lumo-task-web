# Legal notices — Terms of Service & Privacy Policy (overview)

> **Lumo is a free, open-source personal project — not a company, not a
> commercial product.** It is maintained by volunteers and supported by optional
> donations; there is **no legal entity, no paid subscription, and no company
> mailing address**. These notices are written plainly for a public open-source
> release, not as commercial legal contracts, and do not constitute legal advice.

## Where the authoritative text lives

The **live, user-facing** Terms of Service and Privacy Policy ship in the app and
are the single source of truth:

- `web-app/src/pages/legal/content.ts` — the full bilingual (en/zh) prose,
  rendered by `TermsPage` / `PrivacyPage` and by the in-app `LegalModal` opened
  from the login/register screens.
- Operator identity + contact come from `web-app/src/config/app.ts`
  (`OPERATOR_NAME` = "the Lumo maintainers", contact = the project's GitHub
  issues). **No company entity or physical address is used.**

This document is just a human-readable summary of what those notices say and the
principles behind them. If the two ever disagree, `content.ts` wins.

## What the notices say (summary)

### Terms of Service
- **What it is** — a free, open-source personal-productivity app (tasks, focus,
  habits). Using it means you accept the terms.
- **Your account** — register with a username + password (email optional, used
  only for recovery/notifications). You safeguard your credentials and recovery
  code; you're responsible for activity under your account.
- **Acceptable use** — don't attack security, disrupt the service, access others'
  data, or use it unlawfully.
- **Your content & ownership** — you keep all rights to what you create. Lumo is
  local-first on desktop; hosted data is uploaded only when you enable sync.
- **AI (bring your own key)** — optional; uses an API key you supply, and sends
  content to the provider you choose to fulfil your request.
- **Donations, not sales** — Lumo is free. Optional donations support development,
  are voluntary and non-refundable, and buy no features, warranties, or service
  levels. **There is no subscription and no paid tier.**
- **"As is"** — provided as-is/as-available, no warranties; keep your own backups
  via data export.
- **Liability** — limited to the maximum extent the law allows (for a free
  service, effectively zero).
- **Termination** — delete your account and data any time from Account → Danger
  zone.
- **Governing law** — the law of the maintainer's place of residence, without
  displacing mandatory consumer-protection law where you live.

### Privacy Policy
- **Minimal collection** — account basics (username; optional email; hashed
  password/recovery code), the product data you create, optional GitHub sign-in
  identity, your bring-your-own AI key (encrypted at rest, never returned,
  excluded from export), and standard operational logs.
- **No selling, no ad tracking, no AI training** on your content.
- **Third-party services** — a small, honest set used to run the hosted account:
  hosting, database/storage, transactional email, optional GitHub sign-in, and
  any AI provider you enable. See [`subprocessors.md`](./subprocessors.md).
- **Local-first** — on desktop, data stays on your device unless you enable sync.
- **Your controls** — export all data as JSON, and permanently delete your
  account + data, both in-app.
- **Cookies/local storage** — used only to keep you signed in and remember
  preferences; no third-party ad tracking.

## Maintenance notes

- Change the prose in **`content.ts`** (both `en` and `zh`), then bump its
  `EFFECTIVE_DATE`. Keep this summary in step.
- The login/register screens link these via the in-app `LegalModal`
  (`web-app/src/components/LegalModal.tsx`), reusing the same `content.ts` data —
  one source, no duplication.
- Because there is no company entity, keep operator identity generic
  (`OPERATOR_NAME`) and contact via GitHub issues; only introduce an entity /
  address / paid terms if the project's nature actually changes.
