import { useEffect, useState } from "react";

/**
 * True when the primary pointer cannot hover (touch devices). Row/card actions
 * that fade in on `:hover` are unreachable on such devices, so components use
 * this to keep those actions visible instead. Mirrors the `(hover: none)` CSS
 * media query for JS-driven visibility (inline styles a stylesheet can't reach).
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none)").matches
      : false
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: none)");
    setCoarse(mq.matches);
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return coarse;
}
