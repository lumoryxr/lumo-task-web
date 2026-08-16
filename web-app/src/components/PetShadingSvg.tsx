/**
 * Shared pseudo-3D shading kit for the pet artwork.
 *
 * The pets used to be flat vector shapes (solid fills, one bounce loop), which
 * read as 2D stickers. This kit gives every species one consistent lighting
 * model so they render like soft clay/toy models instead:
 *
 *   · key light      — upper-left, via a radial gradient whose bright stop sits
 *                      off-center; the terminator falls to the lower-right
 *   · rim light      — a thin accent-colored edge on the shadow side, the trick
 *                      that most reads as "3D render" rather than "flat shape"
 *   · ambient occlusion — soft dark contact areas where forms meet (head↔body,
 *                      under limbs), so parts feel seated instead of pasted
 *   · specular gloss — a small blurred highlight on the light side
 *   · contact shadow — a blurred ground ellipse that tightens as the pet rises
 *
 * Everything here is color-agnostic: each species passes its own `PetPalette`,
 * so this file holds no literal colors and stays token-clean. Gradient ids are
 * namespaced per instance (callers pass a `useId()` value) so several pets can
 * render on one page without their <defs> colliding.
 */

export interface PetPalette {
  /** Mid-tone "local color" of the pet. */
  base: string;
  /** Lit side — usually `base` lightened. */
  light: string;
  /** Shadow side — usually `base` darkened. */
  dark: string;
  /** Optional lighter belly/muzzle tone. */
  belly?: string;
  /** Optional lit tone for the belly/muzzle. */
  bellyLight?: string;
}

/**
 * Volumetric gradient + filter definitions for one pet instance.
 *
 * Renders only <defs>, so it is safe to drop in as the first child of the pet's
 * <svg>. Exposed ids (all prefixed with `id`):
 *   `${id}-vol`    volume gradient for head/body masses
 *   `${id}-belly`  softer gradient for belly/muzzle patches
 *   `${id}-limb`   flatter gradient for limbs/ears (less light wrap)
 *   `${id}-eye`    glossy eye-white gradient
 *   `${id}-iris`   iris gradient (dark, with a lit lower edge)
 *   `${id}-gloss`  radial white falloff for specular highlights
 *   `${id}-soft`   gaussian blur filter for AO / contact shadow
 */
export function PetDefs({
  id,
  palette,
}: {
  id: string;
  palette: PetPalette;
}) {
  const { base, light, dark, belly, bellyLight } = palette;
  return (
    <defs>
      {/* Primary volume — key light upper-left, core shadow lower-right. */}
      <radialGradient id={`${id}-vol`} cx="34%" cy="26%" r="84%">
        <stop offset="0%" stopColor={light} />
        <stop offset="46%" stopColor={base} />
        <stop offset="100%" stopColor={dark} />
      </radialGradient>

      {/* Belly / muzzle — same light direction, gentler falloff. */}
      <radialGradient id={`${id}-belly`} cx="38%" cy="30%" r="80%">
        <stop offset="0%" stopColor={bellyLight ?? light} />
        <stop offset="100%" stopColor={belly ?? base} />
      </radialGradient>

      {/* Limbs/ears — smaller forms catch less wrap, so a linear ramp reads better. */}
      <linearGradient id={`${id}-limb`} x1="20%" y1="0%" x2="85%" y2="100%">
        <stop offset="0%" stopColor={light} />
        <stop offset="60%" stopColor={base} />
        <stop offset="100%" stopColor={dark} />
      </linearGradient>

      {/* Glossy eye white — bright at the top, faintly shaded underneath. */}
      <radialGradient id={`${id}-eye`} cx="38%" cy="28%" r="82%">
        <stop offset="0%" stopColor="rgba(255,255,255,1)" />
        <stop offset="70%" stopColor="rgba(246,248,252,1)" />
        <stop offset="100%" stopColor="rgba(198,206,222,1)" />
      </radialGradient>

      {/* Iris — deep center with a bounce-lit lower rim, the classic toy-eye read. */}
      <radialGradient id={`${id}-iris`} cx="50%" cy="34%" r="76%">
        <stop offset="0%" stopColor="rgba(38,30,26,1)" />
        <stop offset="72%" stopColor="rgba(16,10,8,1)" />
        <stop offset="100%" stopColor="rgba(74,58,48,1)" />
      </radialGradient>

      {/* Specular falloff for highlight blobs. */}
      <radialGradient id={`${id}-gloss`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
        <stop offset="60%" stopColor="rgba(255,255,255,0.35)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>

      {/* Ambient-occlusion / contact-shadow blur. */}
      <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  );
}

/**
 * Ground contact shadow. Sits under the pet and breathes counter to the float
 * loop (tighter + fainter as the pet rises), which sells the hover as vertical
 * motion in space rather than a sprite sliding on the screen.
 */
export function ContactShadow({
  id,
  cx,
  cy,
  rx,
  ry = 3.2,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
}) {
  return (
    <ellipse
      className="pet-3d__shadow"
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="rgba(0,0,0,0.55)"
      filter={`url(#${id}-soft)`}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

/**
 * Accent rim light along the shadow edge of a form. `d` is a stroked path that
 * traces the lower-right contour; keeping it a separate stroke (rather than a
 * gradient stop) lets each species hug its own silhouette.
 */
export function RimLight({
  d,
  width = 2,
  opacity = 0.55,
}: {
  d: string;
  width?: number;
  opacity?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--accent-primary)"
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
      style={{ mixBlendMode: "screen" }}
    />
  );
}

/** Soft ambient-occlusion blob — darkens where two forms meet. */
export function Occlusion({
  id,
  cx,
  cy,
  rx,
  ry,
  opacity = 0.35,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity?: number;
}) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="rgba(0,0,0,1)"
      opacity={opacity}
      filter={`url(#${id}-soft)`}
    />
  );
}

/**
 * A glossy toy eye: shaded white, gradient iris, a large primary catchlight and
 * a small secondary one. `look` nudges the pupil horizontally so the pet can
 * glance toward the cursor/screen edge without re-drawing the eye.
 */
export function GlossyEye({
  id,
  cx,
  cy,
  r,
  look = 0,
  happy = false,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  look?: number;
  happy?: boolean;
}) {
  const pupilR = happy ? r * 0.66 : r * 0.58;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-eye)`} />
      {/* Upper-lid ambient shading keeps the sphere from reading as a flat disc. */}
      <ellipse
        cx={cx}
        cy={cy - r * 0.45}
        rx={r * 0.9}
        ry={r * 0.42}
        fill="rgba(0,0,0,0.14)"
      />
      <circle cx={cx + look} cy={cy + r * 0.06} r={pupilR} fill={`url(#${id}-iris)`} />
      {/* Primary catchlight (upper-left) + tiny secondary (lower-right). */}
      <circle cx={cx + look - pupilR * 0.42} cy={cy - pupilR * 0.5} r={r * 0.3} fill="rgba(255,255,255,0.95)" />
      <circle cx={cx + look + pupilR * 0.5} cy={cy + pupilR * 0.45} r={r * 0.14} fill="rgba(255,255,255,0.55)" />
    </g>
  );
}

/** Specular highlight blob for body/head masses. */
export function Gloss({
  id,
  cx,
  cy,
  rx,
  ry,
  opacity = 0.5,
}: {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id}-gloss)`} opacity={opacity} />;
}

/**
 * Shared wrapper that applies the 3D float/turn loop. `excited` swaps in a
 * springy squash-and-stretch hop. Motion is neutralised by the global
 * reduced-motion reset in index.css.
 */
export function Pet3DStage({
  mood,
  children,
}: {
  mood: string;
  children: React.ReactNode;
}) {
  const excited = mood === "excited";
  return (
    <div className="pet-3d">
      <div className={`pet-3d__body${excited ? " pet-3d__body--excited" : ""}`}>{children}</div>
    </div>
  );
}
