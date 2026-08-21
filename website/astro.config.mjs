import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages behind the custom domain:
//   https://web.lumoryxr.com/
// The site is served at the domain root, so `base` is '/' (NOT the old
// '/lumo-task-web' project-page path — that path only applied while the site
// lived at lumoryxr.github.io/lumo-task-web/, and it makes every asset 404 under
// a root custom domain). The custom domain is pinned by public/CNAME, which the
// build copies to dist/ so GitHub Pages keeps it across deploys.
export default defineConfig({
  site: 'https://web.lumoryxr.com',
  base: '/',
  trailingSlash: 'ignore',
  build: { assets: 'assets' },
});
