import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

/**
 * Shared `<MemoryRouter>` wrapper for component / page tests.
 *
 * Mirrors the production `<HashRouter>` (in `src/main.tsx`) by enabling the
 * same v7 future flags, so:
 *   1. Tests no longer spam `React Router Future Flag Warning` on every
 *      render — every test file that previously called `<MemoryRouter>`
 *      directly would emit one of each warning per test case, drowning the
 *      stderr stream in noise.
 *   2. The test environment's behaviour is locked in step with the v7
 *      semantics the production app will adopt when react-router is
 *      upgraded — a test passing today on v6 won't silently change
 *      meaning on v7 because the resolution and startTransition flags
 *      were the only remaining v6/v7 behaviour gaps.
 *
 * Keep this in lockstep with `src/main.tsx` — when the production router
 * gains or removes a future flag, mirror it here.
 */
export function TestRouter({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  return (
    <MemoryRouter
      initialEntries={initialEntries}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {children}
    </MemoryRouter>
  );
}
