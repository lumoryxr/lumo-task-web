import { Fragment } from "react";
import { splitKeywords } from "@/lib/highlightKeywords";

/**
 * Shared task-title renderer. Drops into any styled parent (it emits a
 * Fragment, inheriting the parent's font size/weight/truncation) and
 * emphasizes deadline/priority keywords via <mark>. Every task surface —
 * Matrix, Today, project detail, detail modal — renders titles through this,
 * so the highlight treatment stays identical everywhere.
 */
export function TaskTitle({ text }: { text: string }) {
  const segments = splitKeywords(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.key ? (
          <mark
            key={i}
            style={{
              background: "transparent",
              color: "var(--accent-primary)",
              fontWeight: 700,
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
