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
    <HashRouter
      future={{
        // Opt in to React Router v7's behaviour now so the upgrade is a
        // pure package bump (no behaviour change at runtime). v7_startTransition
        // wraps navigation state updates in React.startTransition, eliminating
        // the per-test "React Router Future Flag Warning" spam and aligning
        // route transitions with the rest of our React 18 concurrent
        // features; v7_relativeSplatPath changes how `*` splat segments resolve
        // relative to their parent — keeping the v7 semantics from day one
        // means no path-resolution surprises when we upgrade react-router.
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </HashRouter>
  </StrictMode>
);
