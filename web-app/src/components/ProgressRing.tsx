/** Compact SVG donut showing a completion percentage (0–100). */
export function ProgressRing({
  pct,
  color,
  size = 26,
  stroke = 3,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const center = size / 2;
  const r = center - stroke;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--border-default)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
