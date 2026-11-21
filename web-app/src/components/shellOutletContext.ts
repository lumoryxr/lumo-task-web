import { useOutletContext } from "react-router-dom";
import type { Quadrant } from "@/types/task";

/**
 * Context the Shell frame hands to its routed pages via `<Outlet context>`.
 * Lets a page (Today, Matrix, …) open the global Quick Create modal that the
 * Shell owns — so the "create task" action can surface prominently in-page,
 * not only in the top bar.
 */
/** What a page can pre-fill when it opens the shared New task dialog. */
export interface QuickCreatePreset {
  quadrant?: Quadrant;
  /** File the new task under this project (and optionally one of its groups). */
  projectId?: string;
  sectionId?: string;
}

export interface ShellOutletContext {
  /**
   * Open the one New task dialog the Shell owns. Every page (Today, Matrix, a
   * project) creates tasks through it, so creating a task looks and works the
   * same everywhere.
   */
  openQuickCreate: (preset?: QuickCreatePreset) => void;
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
