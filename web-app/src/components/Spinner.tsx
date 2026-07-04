interface SpinnerProps {
  /** Diameter in px. Default 16 — sits comfortably inside a text button. */
  size?: number;
  className?: string;
}

/**
 * The app's single inline loading spinner. Inherits the surrounding text color
 * via `currentColor`, so it reads correctly on any button/surface without a
 * per-site color. Decorative (`aria-hidden`) — pair it with `aria-busy` on the
 * control it lives in so the "in progress" state is announced.
 *
 * Standard usage for any action that awaits a backend response: swap the
 * button's label for a spinner and disable it while pending, e.g.
 *   <button disabled={busy} aria-busy={busy}>
 *     {busy ? <Spinner /> : t(labelKey)}
 *   </button>
 */
export function Spinner({ size = 16, className }: SpinnerProps) {
  const borderWidth = size <= 16 ? 2 : Math.round(size / 8);
  return (
    <span
      className={`spinner${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ width: size, height: size, borderWidth }}
    />
  );
}
