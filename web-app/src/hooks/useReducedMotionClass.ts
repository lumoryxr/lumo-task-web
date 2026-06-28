import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Reflects the in-product "Reduce motion" setting onto the document root as a
 * `reduce-motion` class. The matching global CSS rule (index.css) then near-
 * instantly settles every animation/transition app-wide — including root-level
 * toasts and portals that live outside the Shell subtree. This makes the
 * in-app toggle effective independently of the OS `prefers-reduced-motion`
 * preference (which is handled by a separate media query).
 */
export function useReducedMotionClass() {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reducedMotion);
  }, [reducedMotion]);
}
