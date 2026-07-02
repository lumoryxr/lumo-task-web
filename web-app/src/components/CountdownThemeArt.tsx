// Decorative, content-related background motif for a countdown card.
// Line art tinted with the card's accent color (via `currentColor`), rendered
// large and faint behind the content so the countdown number stays readable.

import type { CountdownTheme } from "@/lib/countdownTheme";

const PATHS: Record<CountdownTheme, JSX.Element> = {
  birthday: (
    <>
      {/* cake body + frosting */}
      <path d="M12 42 h40 v9 a4 4 0 0 1 -4 4 H16 a4 4 0 0 1 -4 -4 z" />
      <path d="M12 42 c3 -4 7 -4 10 0 c3 4 7 4 10 0 c3 -4 7 -4 10 0" />
      {/* candles + flames */}
      <line x1="22" y1="42" x2="22" y2="27" />
      <path d="M22 25 c2 -2 2 -4 0 -6 c-2 2 -2 4 0 6 z" />
      <line x1="32" y1="42" x2="32" y2="24" />
      <path d="M32 22 c2 -2 2 -4 0 -6 c-2 2 -2 4 0 6 z" />
      <line x1="42" y1="42" x2="42" y2="27" />
      <path d="M42 25 c2 -2 2 -4 0 -6 c-2 2 -2 4 0 6 z" />
    </>
  ),
  love: (
    <path d="M32 51 C13 37 15 19 32 29 C49 19 51 37 32 51 Z" />
  ),
  travel: (
    <>
      <path d="M55 10 L9 30 L27 34 L31 52 L38 38 Z" />
      <line x1="27" y1="34" x2="55" y2="10" />
    </>
  ),
  graduation: (
    <>
      <path d="M8 26 L32 16 L56 26 L32 36 Z" />
      <path d="M20 31 v9 c0 3 24 3 24 0 v-9" />
      <line x1="56" y1="26" x2="56" y2="41" />
    </>
  ),
  festival: (
    <>
      <circle cx="32" cy="32" r="2.5" />
      <line x1="32" y1="20" x2="32" y2="12" />
      <line x1="32" y1="44" x2="32" y2="52" />
      <line x1="20" y1="32" x2="12" y2="32" />
      <line x1="44" y1="32" x2="52" y2="32" />
      <line x1="23" y1="23" x2="17" y2="17" />
      <line x1="41" y1="23" x2="47" y2="17" />
      <line x1="23" y1="41" x2="17" y2="47" />
      <line x1="41" y1="41" x2="47" y2="47" />
    </>
  ),
  milestone: (
    <>
      <circle cx="32" cy="32" r="18" />
      <circle cx="32" cy="32" r="11" />
      <circle cx="32" cy="32" r="4" />
    </>
  ),
  default: (
    <>
      <rect x="14" y="18" width="36" height="34" rx="4" />
      <line x1="14" y1="28" x2="50" y2="28" />
      <line x1="24" y1="13" x2="24" y2="21" />
      <line x1="40" y1="13" x2="40" y2="21" />
    </>
  ),
};

interface CountdownThemeArtProps {
  theme: CountdownTheme;
  /** Accent color for the motif (a CSS token/color string). */
  color: string;
}

export function CountdownThemeArt({ theme, color }: CountdownThemeArtProps) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        right: -14,
        bottom: -14,
        width: 132,
        height: 132,
        color,
        opacity: 0.12,
        pointerEvents: "none",
      }}
    >
      <svg
        viewBox="0 0 64 64"
        width="100%"
        height="100%"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[theme]}
      </svg>
    </div>
  );
}
