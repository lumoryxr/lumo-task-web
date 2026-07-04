import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages project site:
//   https://lumoryxr.github.io/lumo-task-web/
export default defineConfig({
  site: 'https://lumoryxr.github.io',
  base: '/lumo-task-web',
  trailingSlash: 'ignore',
  build: { assets: 'assets' },
});
