# Version Management

This document outlines the versioning strategy and release process for lumo-task-web.

## Semantic Versioning

We follow **Semantic Versioning 2.0.0** format: `MAJOR.MINOR.PATCH`

### MAJOR version
- Incremented when incompatible API changes are made
- Example: 1.0.0 → 2.0.0
- Examples of breaking changes:
  - Removal of an API endpoint
  - Changing parameter types or response structure
  - Database schema changes requiring migration

### MINOR version
- Incremented when new functionality is added in a backward-compatible manner
- Example: 1.0.0 → 1.1.0
- Examples:
  - New API endpoints
  - New features
  - Deprecations (with warnings)

### PATCH version
- Incremented when backward-compatible bug fixes are made
- Example: 1.0.0 → 1.0.1
- Examples:
  - Bug fixes
  - Performance improvements
  - Documentation updates

## Version Format

Current version is tracked in:
- `package.json` (both web-app and backend)
- `CHANGELOG.md`
- Git tags: `v1.2.3`

## Release Process

### 1. Prepare Release

Before releasing, ensure:
- All tests pass: `npm test`
- All type checks pass: `npm run typecheck`
- Code is linted: `npm run lint`
- CHANGELOG.md is up-to-date with all changes

### 2. Update Version

Update version numbers in:
```bash
# web-app
cd web-app && npm version patch|minor|major

# backend
cd backend && npm version patch|minor|major
```

This automatically:
- Updates `package.json` version
- Creates a git commit
- Creates a git tag

### 3. Update CHANGELOG

Update `CHANGELOG.md` with:
- Version number
- Release date
- All changes (Added, Fixed, Changed, Deprecated, Removed, Security)
- Migration instructions (if applicable)

Format:
```markdown
## [1.2.3] - 2026-01-15

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Breaking change description (marked clearly)

### Deprecated
- Deprecated feature description

### Removed
- Removed feature description

### Security
- Security fix description
```

### 4. Create Release

```bash
git tag v1.2.3
git push origin main --tags
```

Create a Release on GitHub:
- Draft Release from tag
- Copy CHANGELOG content
- Publish as Release

### 5. Deploy

Deployment is triggered automatically on tag push (see `.github/workflows/release.yml`).

## Pre-Release Versions

For pre-releases (alpha, beta, RC), use:
- `1.0.0-alpha.1`
- `1.0.0-beta.2`
- `1.0.0-rc.1`

Pre-releases are not promoted as stable releases.

## Versioning in Development

During development, the version is `0.0.0-dev`.

When first production release is ready, bump to `1.0.0`.

## Breaking Changes

Breaking changes MUST:
1. Be marked with **BREAKING CHANGE:** prefix in commit message
2. Be documented in CHANGELOG under its own section
3. Have a deprecation period (if possible) before removal
4. Include migration guide in Release Notes
5. Bump MAJOR version

## Long-Term Support (LTS)

Not currently applicable. Future versions may have LTS support.

## Compatibility

### Node.js
- Minimum: Node.js 20
- Target: Latest LTS

### Browsers
- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

### Databases
- SQLite: 3.40+
- PostgreSQL: 13+

## Questions?

Refer to:
- [CHANGELOG.md](/CHANGELOG.md) for release history
- [.github/workflows/release.yml](workflows/release.yml) for automation
- [Semantic Versioning](https://semver.org/) for detailed spec
