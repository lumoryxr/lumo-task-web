import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, independently-cacheable vendor code out of the entry
        // chunk so the initial payload is smaller and vendor bundles stay
        // cached across app deploys. Routes are split via React.lazy in App.tsx.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@azure/msal-browser")) return "msal";
          if (id.includes("html2canvas")) return "html2canvas";
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id
            )
          ) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
