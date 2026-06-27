/**
 * Shared modal/dialog accessibility hook.
 *
 * One place for the four keyboard concerns every modal needs, so a new modal gets
 * them for free instead of re-implementing (the audit found Esc done 6 different
 * ways, focus-trap and focus-return done nowhere):
 *   1. Esc-to-close
 *   2. Focus-trap — Tab / Shift+Tab cycle within the dialog, never escaping behind it
 *   3. Focus-return — restore focus to the trigger element when the dialog unmounts
 *   4. Initial focus — move focus into the dialog on open (unless the dialog already
 *      placed it, e.g. an autoFocus input — we don't steal that)
 *
 * Usage: attach the returned ref to the element carrying role="dialog" (give it
 * tabIndex={-1} so it can receive focus when it has no focusable children):
 *
 *   const dialogRef = useModalA11y(onClose);
 *   <div role="dialog" aria-modal="true" ref={dialogRef} tabIndex={-1}>…</div>
 *
 * `isOpen` (default true) lets a modal that stays mounted and gates itself internally
 * (e.g. `if (!open) return null`) scope the behaviour to its open state, so focus-trap
 * and focus-return fire per open/close rather than once per app lifetime. Modals that
 * are conditionally mounted by their parent can omit it.
 *
 * The keydown listener lives on `window` so it catches Esc regardless of where focus
 * is (inside the dialog, on a child, or document-level). Esc is stopPropagation'd so
 * it doesn't also trigger an outer handler.
 */
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

export function useModalA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void, isOpen = true) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const node = ref.current;
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;

    const focusable = (): HTMLElement[] => {
      if (!node) return [];
      // Modals hide content by unmounting (conditional render), not display:none, so
      // every queried node is genuinely interactive — we only skip aria-hidden subtrees.
      return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.closest("[aria-hidden='true']") === null,
      );
    };

    // Initial focus — only if the dialog didn't already focus something (autoFocus).
    if (node && !node.contains(document.activeElement)) {
      const items = focusable();
      if (items.length) items[0].focus();
      else node.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = focusable();
      if (items.length === 0) {
        // Nothing focusable but the dialog itself — keep focus on it.
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Focus-return — restore focus to whatever was focused before the dialog opened.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  return ref;
}
