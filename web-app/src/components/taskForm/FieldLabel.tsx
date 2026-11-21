import type { ReactNode } from "react";

/** The small uppercase label above a task-form field, with an optional action on its right. */
export function FieldLabel({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <div id={id} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
        {children}
      </div>
      {action}
    </div>
  );
}

/** A quiet text button for a field label's action (e.g. "Clear"). */
export function FieldAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-[10px] text-text-faint hover:text-text-primary transition-colors">
      {children}
    </button>
  );
}
