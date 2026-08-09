# Changelog

All notable changes to the lumo-task-web project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- feat: Mandatory login (#14) — signing in is now required to use the app; the "返回"/"continue without an account" escape hatches were removed from the auth screens (the shared `AuthShell` back button now renders only when a caller supplies an explicit destination). The route guard was extracted to a unit-tested policy (`guardRedirect`) that keeps the public routes — sign-in, registration, **password recovery, email verification, and the legal pages** — reachable while signed out. Local-first is unchanged: the desktop app still stores your data locally; you simply sign into a local account for user isolation

### Fixed
- security: `POST /v1/auth/bind-email` now invalidates any outstanding email-verification tokens when the bound email changes — a stale link from a previously-bound address can no longer flip `email_verified` on for a newly-bound, unconfirmed email (verification tokens carry only the userId, not the target address)
- fix: the `/verify-email` page's CTAs (and the removed back button) no longer dead-end at `/today` for a signed-out visitor — they route to sign-in under the mandatory-login guard
- chore: removed dead `makeInitials()` from the auth route (superseded by username-derived initials)

### Added
- feat: Username-first auth (#17) + password recovery (#16) — registration now collects only `username` + `password` (no email); `POST /v1/auth/signin` authenticates by username (case-insensitive). Email is optional and bound AFTER registration via `POST /v1/auth/bind-email` (goes through the existing verification flow; the "verify your email" banner only shows once an email is bound-but-unverified). Every account gets a one-time **recovery code** (`LUMO-XXXX-XXXX-XXXX-XXXX`, Crockford base32, stored hashed, shown once at registration) that resets a password offline via `POST /v1/auth/recovery/reset`; `POST /v1/auth/recovery-code/regenerate` rotates it. Two recovery channels surfaced from one "forgot password" entry (email link + recovery code). Contract-first: `username` added to the user profile, `email` made nullable, new `USERNAME_TAKEN` (409) + `INVALID_RECOVERY_CODE` (400) error codes. DB: `users.username`/`username_lower` (partial-unique), `email` made genuinely nullable via a guarded table-rebuild with backfill, new single-use `recovery_codes` table
- feat: Email verification (soft) — registration issues a single-use token and emails a confirmation link; accounts start unverified (`emailVerified` on the profile), a dismissable "verify your email" banner nudges the user, and `POST /v1/auth/verify-email` + `POST /v1/auth/resend-verification` + `/verify-email` page complete the flow. Non-blocking; reuses the `sendEmail()` provider layer. New `INVALID_VERIFICATION_TOKEN` error code
- feat: Production-grade structured logging — leveled logger (`debug`/`info`/`warn`/`error`) with `LUMO_LOG_LEVEL` config, a consistent base envelope (`service`/`env`/`version`) on every JSON line, and mandatory secret redaction of credential-like fields. Audit log now flows through the same seam (`category: "audit"`); route error paths log structured + `requestId`-correlated instead of ad-hoc `console.error`. Docs: `docs/ops/logging.md`
- feat: Password reset flow — `POST /v1/auth/forgot-password` (enumeration-safe) + `POST /v1/auth/reset-password` (short-lived single-use token; resets password, bumps session version, revokes refresh tokens). New `/forgot-password` and `/reset-password` web pages; login page "Forgot password" wired. Provider-agnostic `sendEmail()` lib (Resend + dev transport) behind `LUMO_EMAIL_*` env
- feat: Account data export (GDPR/CCPA) — `GET /v1/user/export` returns a secret-free JSON bundle of all user-scoped data; surfaced in Account → Data & privacy as a download. Contract-first (`DataExportWire`)
- feat: Account deletion (right to erasure) — `DELETE /v1/user` cascades across every user-scoped table; surfaced in Account → Danger zone behind an email-typing confirmation. Contract-first (`DeleteAccountResponse`)
- feat: Bilingual Privacy Policy and Terms of Service pages at `/legal/privacy` and `/legal/terms`, linked from the registration consent line and the marketing footer (content pending legal review)
- docs: `docs/LAUNCH_CHECKLIST.md` (P0/P1/P2 public-beta readiness) and `docs/GO_TO_MARKET.md` (promotion plan)
- feat: Server-side task keyword search — `GET /v1/tasks?q=` filters by title/description (both locales), case-insensitive, LIKE-wildcard-escaped, contract-first (`TaskListQuerySchema`); `api.listTasks(q?)` on the web client
- ci: GitLab CI/CD migrated from GitHub Actions (`.gitlab-ci.yml`) — 13-job gate, tag Release, manual Windows packaging; `.gitlab/` issue/MR templates, root `CODEOWNERS`, `docs/ENGINEERING_PROCESS.md`
- feat: Habit check-in dialog + daily check-in badge (PR #126)
- feat: Optimize completed timeline visual — extracted CompletedTimeline component with 14 unit tests (PR #130)
- feat: AI auto PR code review workflow (PR #131)
- docs: Industry-standard bilingual documentation — README.md (EN), README.zh.md (ZH), updated ARCHITECTURE.md, CHANGELOG.md, new docs/ROADMAP.md (Issue #129)
- Engineering standards documentation (CONTRIBUTING.md, ARCHITECTURE.md)
- Code review checklist and standards
- Custom Claude Code commands (/check-tests, /commit-push-pr, /triage-issues)
- Cross-platform development tools
- GitHub issue templates (Epic, Story)
- Architecture Decision Records (ADR) framework
- Automated issue lifecycle management
- Issue auto-triage workflow
- Release automation workflow

### Changed
- Improved PR template with ECC skills integration and comprehensive checklist
- Enhanced CLAUDE.md with multi-role collaboration guidelines

### Fixed
- test: Migrated the backend integration suite (`integration.test.ts`), the daily DFX regression suite (`dfx.integration.test.ts`), and all Playwright/Electron e2e specs to the username-first auth contract (#17) — register/signin now use `{ username, password }`, the profile asserts `username` + `email: null`, the register e2e flow drives the new one-time recovery-code gate, and the `#387` robustness ACs were rewritten to pin the username validation bounds (charset / length / reserved / min) instead of the removed email-shape + `name`-length bounds. Fixes RED CI on the integration + e2e jobs
- fix: Production frontend no longer silently falls back to `localhost:47291` when `VITE_API_BASE` is unset — it logs a loud error and falls back to same-origin `/v1`
- fix: Dead landing-page footer links (Privacy, Terms, Contact, Documentation, Changelog) now point to real destinations
- Removed hardcoded Windows-specific paths from .claude/settings.json

---

## Version History Format

For each new version, add a section like:

```markdown
## [1.0.0] - 2026-01-15

### Added
- Feature one
- Feature two

### Changed
- Existing feature improvement

### Deprecated
- Old feature (will be removed in 2.0.0)

### Removed
- Removed feature

### Fixed
- Bug fix

### Security
- Security patch
```

---

## Release Notes Guidelines

### When to Release

- **Patch**: Bug fixes, minor improvements (can be released weekly)
- **Minor**: New features (released as needed)
- **Major**: Breaking changes (coordinate with team)

### Before Releasing

1. Ensure CI/CD passes
2. Update CHANGELOG.md
3. Update version in package.json files
4. Create Release on GitHub
5. Deploy to production

### Commit Message Format

Changes should use Conventional Commits:
- `feat:` for features
- `fix:` for bug fixes
- `docs:` for documentation
- `refactor:` for refactoring
- `test:` for tests
- `ci:` for CI/CD
- `chore:` for maintenance

---

## [1.0.0] - TBD

This will be the first stable release of lumo-task-web.

### Planned for 1.0.0
- [ ] Core task management features
- [ ] User authentication
- [ ] Real-time task updates
- [ ] Mobile-responsive design
- [ ] API documentation
- [ ] User guide and tutorials

---

## How to Update CHANGELOG

### Automatically (Recommended)
When a PR is merged, the CHANGELOG is automatically updated based on commit messages.

```bash
# PR commit message
feat(tasks): add task filtering

# After merge, CHANGELOG.md is updated:
## [Unreleased]
### Added
- Add task filtering capability
```

### Manually
If automatic update didn't work, manually add to `## [Unreleased]` section:

1. Open CHANGELOG.md
2. Find the `## [Unreleased]` section
3. Add your change under appropriate subsection (Added, Changed, Fixed, etc.)
4. Keep entries organized and user-friendly

### Example Entry

```markdown
### Added
- Task filtering by priority and due date (#123)
- API endpoint `/api/tasks/filter` for task queries

### Fixed
- Incorrect task count in sidebar (#456)

### Changed
- API response format for bulk task operations (BREAKING CHANGE: see migration guide)
```

---

## Linking Issues

Use issue numbers to link changes to the tracking system:

```markdown
### Added
- New notification system (#789)

### Fixed
- Memory leak in task list component (#790)
```

These will automatically link to GitHub issues.

---

## Breaking Changes

Always mark breaking changes clearly:

```markdown
### Changed
- **BREAKING CHANGE**: API response format changed from XML to JSON
  - Migration guide: See API documentation at /docs/migration-v2.0.md
  - Affects: All API clients
```

---

## Pre-release Versions

For alpha, beta, or RC versions:

```markdown
## [2.0.0-beta.1] - 2026-02-01

### Added
- Experimental real-time sync feature

### Known Issues
- Real-time sync may cause high CPU usage (issue #999)
```

---

## Archive

Old releases are tagged in Git:
```bash
git tag v1.0.0
git log --oneline v1.0.0
```

View archived releases: https://github.com/lumoryxr/lumo-task-web/releases

---

## Questions?

- Check [Semantic Versioning](https://semver.org/) for version format
- See [Keep a Changelog](https://keepachangelog.com/) for format best practices
- Review [.github/VERSION.md](.github/VERSION.md) for versioning policy
- Check [CONTRIBUTING.md](.github/CONTRIBUTING.md) for commit conventions
