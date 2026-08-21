# Lumo — marketing website

The public landing page for Lumo, built with [Astro](https://astro.build) and
deployed to GitHub Pages behind the custom domain **https://web.lumoryxr.com/**.
The domain is pinned by `public/CNAME`; the site is built at the domain root
(`astro.config.mjs` base `/`). The app itself lives at **task.lumoryxr.com**.

Dark, aurora-styled, fully bilingual (EN / 中文), zero-runtime-framework — just
static HTML/CSS with a few inline scripts (language toggle + scroll reveal). All
motion respects `prefers-reduced-motion`.

## Develop

```bash
cd website
npm install
npm run dev        # http://localhost:4321/
```

## Build

```bash
npm run build      # → website/dist  (root base + CNAME baked in)
npm run preview
```

## Structure

- `src/pages/index.astro` — assembles the sections
- `src/layouts/Base.astro` — `<head>`, fonts, language + reveal scripts
- `src/components/` — one file per section (Hero, Bento, Steps, FAQ, …) plus the
  hand-built `AppMock` (a beautified Today-view mock, not a screenshot)
- `src/styles/global.css` — design tokens, theme, animations

## i18n

Each translatable string is authored twice with `data-i18n-en` / `data-i18n-zh`
attributes; `global.css` shows the one matching `html[lang]`. The toggle button
(`data-lang-toggle`) flips `html[lang]` and persists to `localStorage`.

## Deploy

`.github/workflows/deploy-website.yml` builds this directory and pushes
`dist/` to the `gh-pages` branch on any push to `main` under `website/**`.
This is the single canonical marketing site; the legacy `landing/` single-file
page has been removed.
