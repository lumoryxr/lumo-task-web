import type { ReactNode } from "react";

export interface RankedItem {
  key: string;
  label: string;
  count: number;
  /** Optional mark before the name (an emoji, a colour dot). */
  lead?: ReactNode;
}

/**
 * Ranked horizontal bars, largest first: a name, an aligned bar in the one
 * accent hue (scaled to the leader) and the figure. The bar drops under the
 * name where the card is narrow.
 */
export function RankedList({ items, empty, unit }: { items: RankedItem[]; empty: string; unit?: string }) {
  if (items.length === 0) {
    return <p className="text-[12.5px] text-text-faint py-6 text-center">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, idx) => (
        <li key={it.key} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5">
          <span className="text-[11px] font-semibold text-text-faint tabular-nums">{idx + 1}</span>
          <span className="flex items-center gap-1.5 min-w-0 text-[12.5px] text-text-secondary">
            {it.lead}
            <span className="truncate" title={it.label}>{it.label}</span>
          </span>
          <span className="col-start-2 col-span-2 sm:col-start-auto sm:col-span-1 row-start-2 sm:row-start-auto h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(4, (it.count / max) * 100)}%`, background: "var(--accent-primary)" }}
            />
          </span>
          <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto text-[12.5px] font-semibold text-text-primary tabular-nums text-right">
            {it.count}
            {unit && <span className="ml-0.5 font-normal text-text-faint">{unit}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
