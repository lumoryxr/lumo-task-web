import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "@/App";
import { captureAttribution } from "@/utils/attribution";
import "@/index.css";

// Record which channel this visitor arrived from (share-card QR, a post, …)
// before the app mounts, so the tag is captured even if the first render
// redirects. Runs ahead of the router: with HashRouter the tag sits in
// `location.search`, ahead of the `#/route`, and is stripped once stored.
captureAttribution();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);
