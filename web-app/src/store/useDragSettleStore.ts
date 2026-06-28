import { create } from "zustand";

/**
 * Transient UI state for the Matrix drag-settle micro-interaction: when a task
 * card is dropped into a quadrant it jumps there instantly, so we briefly flag
 * the moved card's id to let it play a short settle animation. The flag clears
 * itself after the animation window so it never lingers.
 *
 * Purely decorative — the CSS animation is auto-collapsed under reduced motion
 * (OS or in-product), so reduced-motion users simply see the instant move.
 */
const SETTLE_MS = 360;

interface DragSettleState {
  settleId: string | null;
  /** Flag a just-dropped card; auto-clears after the settle window. */
  settle: (id: string) => void;
  /** Cancel any pending clear and reset (e.g. on unmount). */
  clear: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useDragSettleStore = create<DragSettleState>((set) => ({
  settleId: null,
  settle: (id) => {
    if (timer) clearTimeout(timer);
    set({ settleId: id });
    timer = setTimeout(() => {
      timer = undefined;
      set({ settleId: null });
    }, SETTLE_MS);
  },
  clear: () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    set({ settleId: null });
  },
}));

export const DRAG_SETTLE_MS = SETTLE_MS;
