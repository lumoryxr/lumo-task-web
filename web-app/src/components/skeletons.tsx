import { Skeleton, SkeletonScreen } from "@/components/Skeleton";

/**
 * Page-level loading skeletons.
 *
 * Each one mirrors the rough shape of the content it stands in for, so the
 * layout doesn't jump when the real data arrives. They reuse {@link Skeleton}
 * (themed, reduced-motion-aware shimmer bars) inside a {@link SkeletonScreen}
 * (`role=status` / `aria-busy`) so assistive tech announces a single polite
 * "Loading…" instead of the decorative bars.
 */

/** One placeholder row mimicking a task card (icon dot + title + meta line). */
function TaskRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl bg-surface border border-border-faint"
      style={{ padding: "14px 16px" }}
    >
      <Skeleton className="shrink-0" style={{ width: 18, height: 18, borderRadius: 6 }} />
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <Skeleton style={{ height: 12, width: "60%" }} />
        <Skeleton style={{ height: 10, width: "35%" }} />
      </div>
    </div>
  );
}

/** Loading state for the Today / task-list view: a header bar + a few rows. */
export function TaskListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonScreen className="p-8 flex flex-col gap-2">
      <Skeleton className="mb-2" style={{ height: 18, width: 140 }} />
      {Array.from({ length: rows }, (_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </SkeletonScreen>
  );
}

/** Loading state for the Habits page: a few habit-card placeholders (emoji
 *  block + title/meta + streak pill), so it doesn't flash the empty state
 *  before habits load (#207). Rendered inside the page's own list container. */
export function HabitListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonScreen className="space-y-2 pt-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-border-faint">
          <Skeleton className="shrink-0" style={{ width: 40, height: 40, borderRadius: "var(--radius-lg)" }} />
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <Skeleton style={{ height: 13, width: "45%" }} />
            <Skeleton style={{ height: 10, width: "28%" }} />
          </div>
          <Skeleton className="shrink-0" style={{ width: 72, height: 24, borderRadius: "var(--radius-md)" }} />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** Loading state for the Projects page: an auto-fill grid of project-card
 *  placeholders (title + meta line + progress bar), matching the real grid so
 *  the page doesn't flash the "no projects yet" empty state before projects
 *  load (mirrors the habits fix #285). Rendered below the page header. */
export function ProjectListSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <SkeletonScreen>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 p-4 rounded-2xl bg-surface border border-border-faint">
            <Skeleton style={{ height: 15, width: "55%" }} />
            <Skeleton style={{ height: 10, width: "35%" }} />
            <Skeleton className="mt-1" style={{ height: 8, width: "100%", borderRadius: "var(--radius-sm)" }} />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

/** Loading state for the Stats page: a grid of stat cards + a chart block. */
export function StatsSkeleton() {
  return (
    <SkeletonScreen className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 p-4 rounded-xl bg-surface border border-border-faint">
            <Skeleton style={{ height: 10, width: "50%" }} />
            <Skeleton style={{ height: 26, width: "40%" }} />
            <Skeleton style={{ height: 9, width: "70%" }} />
          </div>
        ))}
      </div>
      <Skeleton style={{ height: 140, width: "100%", borderRadius: "var(--radius-lg)" }} />
    </SkeletonScreen>
  );
}

/** Loading state for the Eisenhower Matrix: a 2×2 grid of quadrant placeholders. */
export function MatrixSkeleton() {
  return (
    <SkeletonScreen className="p-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, q) => (
        <div key={q} className="flex flex-col gap-3 p-4 rounded-2xl bg-surface border border-border-faint">
          <Skeleton style={{ height: 14, width: "40%" }} />
          {Array.from({ length: 2 }, (_, r) => (
            <TaskRowSkeleton key={r} />
          ))}
        </div>
      ))}
    </SkeletonScreen>
  );
}
