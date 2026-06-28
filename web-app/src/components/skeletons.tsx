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
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border-faint">
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
    <SkeletonScreen className="p-8 flex flex-col gap-3">
      <Skeleton className="mb-2" style={{ height: 18, width: 140 }} />
      {Array.from({ length: rows }, (_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
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
