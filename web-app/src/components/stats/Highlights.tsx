import type { ReactNode } from "react";

export interface Highlight {
  key: string;
  icon: ReactNode;
  text: string;
}

/** A short, plain-language read of the period: an icon and one sentence each. */
export function Highlights({ items, empty }: { items: Highlight[]; empty: string }) {
  if (items.length === 0) return <p className="text-[12.5px] text-text-faint py-6 text-center">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((h) => (
        <li key={h.key} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
            style={{ background: "var(--bg-elevated)", color: "var(--accent-primary)" }}
          >
            {h.icon}
          </span>
          <span className="text-[13px] text-text-secondary leading-snug pt-1.5">{h.text}</span>
        </li>
      ))}
    </ul>
  );
}
