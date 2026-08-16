# Security Policy

Lumo Task is a free, open-source personal project. Even so, it handles user
accounts and task data, so we take security reports seriously and try to respond
quickly.

## Supported versions

Lumo Task ships continuously from `main`; the hosted demo always tracks the
latest merged commit. Security fixes are applied to `main` and the most recent
desktop release.

| Version                       | Supported          |
| ----------------------------- | ------------------ |
| `main` (hosted demo)          | :white_check_mark: |
| Latest desktop release        | :white_check_mark: |
| Older desktop releases        | :x:                |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Public issues disclose the problem before a fix is available and put other users
at risk.

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **[Security tab](https://github.com/lumoryxr/lumo-task-web/security)**.
2. Click **"Report a vulnerability"** to open a private advisory visible only to
   the maintainers.

This keeps the report confidential and requires no email exchange. If private
reporting is unavailable to you, open a regular issue that says only *"I'd like
to report a security issue privately"* (no details) and a maintainer will follow
up.

### What to include

To help us triage quickly, please include where you can:

- A clear description of the issue and its impact.
- Steps to reproduce (a proof-of-concept, request, or short script is ideal).
- Affected surface (frontend, backend API, desktop app, deployment/config).
- Any relevant version, commit, or URL.

## What to expect

- **Acknowledgement:** within 48 hours (a security bug is treated as at least P1
  per our [contributing guide](.github/CONTRIBUTING.md)).
- **Assessment:** we'll confirm the issue, determine severity, and share a rough
  timeline.
- **Fix & disclosure:** we'll work on a fix and coordinate disclosure with you.
  With your permission we're happy to credit you in the advisory once the fix
  ships.

## Scope

In scope: this repository's web app, backend API, desktop builds, and the
deployment configuration contained here.

Out of scope: third-party dependencies (please report upstream), findings that
require a compromised device or physical access, and volumetric/DoS testing
against the shared demo instance — please don't stress-test the public demo.

## Safe harbor

We consider security research conducted in good faith — that respects user
privacy, avoids data destruction, and follows this policy — to be authorized. We
won't pursue action against researchers who report responsibly and give us a
reasonable chance to fix the issue before public disclosure.

Thank you for helping keep Lumo Task and its users safe. 🔒
