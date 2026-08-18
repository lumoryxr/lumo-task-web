import { useId } from "react";
import {
  PetDefs,
  ContactShadow,
  RimLight,
  Occlusion,
  GlossyEye,
  Gloss,
  Pet3DStage,
  type PetPalette,
} from "@/components/PetShadingSvg";

/** White fur needs a cooler shadow than pure grey or it reads as dirty. */
const PALETTE: PetPalette = {
  base: "#eef1f6",
  light: "#ffffff",
  dark: "#b3bccb",
  belly: "#ffffff",
  bellyLight: "#ffffff",
};

/** The black patches get their own ramp so they stay readable in the dark UI. */
const INK = { base: "#232830", light: "#454e5c", dark: "#12151a" };
const NOSE = "#191d23";

export function PandaSvg({ mood, size = 64 }: { mood: string; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const scale = size / 64;
  const happy = mood === "happy" || mood === "excited";

  return (
    <Pet3DStage mood={mood}>
      <svg
        width={64 * scale}
        height={76 * scale}
        viewBox="0 0 64 76"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", overflow: "visible" }}
      >
        <PetDefs id={uid} palette={PALETTE} />
        <defs>
          {/* Dedicated ramp for the black fur masses */}
          <radialGradient id={`${uid}-ink`} cx="34%" cy="26%" r="84%">
            <stop offset="0%" stopColor={INK.light} />
            <stop offset="52%" stopColor={INK.base} />
            <stop offset="100%" stopColor={INK.dark} />
          </radialGradient>
        </defs>

        <ContactShadow id={uid} cx={32} cy={71} rx={19} />

        {/* Stubby tail */}
        <ellipse cx="52" cy="49" rx="6" ry="5" fill={`url(#${uid}-vol)`} />

        {/* Body */}
        <ellipse cx="32" cy="48" rx="21" ry="15" fill={`url(#${uid}-vol)`} />
        {/* Black shoulder saddles */}
        <ellipse cx="13" cy="48" rx="8" ry="12" fill={`url(#${uid}-ink)`} />
        <ellipse cx="51" cy="48" rx="8" ry="12" fill={`url(#${uid}-ink)`} />
        <rect x="11" y="55" width="10" height="15" rx="5" fill={`url(#${uid}-ink)`} />
        <rect x="43" y="55" width="10" height="15" rx="5" fill={`url(#${uid}-ink)`} />
        <Occlusion id={uid} cx={32} cy={63} rx={16} ry={4} opacity={0.32} />

        {/* Ears */}
        <circle cx="16" cy="10" r="9" fill={`url(#${uid}-ink)`} />
        <circle cx="48" cy="10" r="9" fill={`url(#${uid}-ink)`} />
        <circle cx="14" cy="7.5" r="3.4" fill="rgba(255,255,255,0.14)" />

        <Occlusion id={uid} cx={32} cy={40} rx={14} ry={4.5} opacity={0.32} />

        {/* Head */}
        <circle cx="32" cy="24" r="19" fill={`url(#${uid}-vol)`} />

        {/* Eye patches — angled slightly for a friendlier read */}
        <ellipse cx="22" cy="23" rx="8" ry="7.2" fill={`url(#${uid}-ink)`} transform="rotate(-12 22 23)" />
        <ellipse cx="42" cy="23" rx="8" ry="7.2" fill={`url(#${uid}-ink)`} transform="rotate(12 42 23)" />

        {/* Rim light — cool edge traced along the real head silhouette. The body
            arc is skipped: the black shoulder saddles already own that contour. */}
        <RimLight d="M 42.9 8.44 A 19 19 0 0 1 44.21 38.56" width={2} opacity={0.42} />

        <Gloss id={uid} cx={23} cy={13.5} rx={9} ry={6.5} opacity={0.45} />
        <Gloss id={uid} cx={26} cy={43} rx={8} ry={5} opacity={0.25} />

        {/* Eyes */}
        <GlossyEye id={uid} cx={22.5} cy={22.5} r={4.6} look={0.7} happy={happy} />
        <GlossyEye id={uid} cx={41.5} cy={22.5} r={4.6} look={0.7} happy={happy} />

        {/* Nose */}
        <ellipse cx="32" cy="30.5" rx="4.2" ry="3.1" fill={NOSE} />
        <circle cx="30.7" cy="29.5" r="1.05" fill="rgba(255,255,255,0.5)" />

        {/* Mouth */}
        <path
          d={happy ? "M 27 33.5 Q 32 39.4 37 33.5" : "M 28 33.5 Q 32 36.4 36 33.5"}
          stroke={NOSE}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cheek blush */}
        <ellipse cx="16.5" cy="31.5" rx="4.4" ry="3" fill="#ff8fa8" opacity="0.3" />
        <ellipse cx="47.5" cy="31.5" rx="4.4" ry="3" fill="#ff8fa8" opacity="0.22" />

        {/* Front paws */}
        <rect x="19" y="56" width="11" height="13" rx="5.5" fill={`url(#${uid}-ink)`} />
        <rect x="34" y="56" width="11" height="13" rx="5.5" fill={`url(#${uid}-ink)`} />

        {mood === "excited" && (
          <>
            <circle cx="8" cy="12" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" />
            <circle cx="56" cy="10" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" style={{ animationDelay: "0.3s" }} />
            <circle cx="4" cy="31" r="1.5" fill="var(--accent-primary)" opacity="0.7" className="pet-sparkle" style={{ animationDelay: "0.15s" }} />
          </>
        )}
      </svg>
    </Pet3DStage>
  );
}
