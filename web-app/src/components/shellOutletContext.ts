import { useOutletContext } from "react-router-dom";
import type { Quadrant } from "@/types/task";

/**
 * Context the Shell frame hands to its routed pages via `<Outlet context>`.
 * Lets a page (Today, Matrix, …) open the global Quick Create modal that the
 * Shell owns — so the "create task" action can surface prominently in-page,
 * not only in the top bar.
 */
export interface ShellOutletContext {
  /** Open the Quick Create task modal, optionally preset to a quadrant. */
  openQuickCreate: (quadrant?: Quadrant) => void;
}

const NOOP_CONTEXT: ShellOutletContext = { openQuickCreate: () => {} };

/**
 * Read the Shell outlet context. Falls back to a no-op when a page is rendered
 * outside the Shell (e.g. in unit tests or Storybook), so pages never crash for
 * lack of a provider.
 */
export function useShellOutlet(): ShellOutletContext {
  return useOutletContext<ShellOutletContext | null>() ?? NOOP_CONTEXT;
}
