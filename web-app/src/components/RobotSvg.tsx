import { useId } from "react";
import {
  PetDefs,
  ContactShadow,
  RimLight,
  Occlusion,
  Gloss,
  Pet3DStage,
  type PetPalette,
} from "@/components/PetShadingSvg";

/** Brushed steel-blue chassis. */
const PALETTE: PetPalette = {
  base: "#5a6b80",
  light: "#8ea3bb",
  dark: "#333f4e",
  belly: "#3c4857",
  bellyLight: "#5f6f82",
};

const RECESS = "#232c38";

export function RobotSvg({ mood, size = 64 }: { mood: string; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const scale = size / 64;
  const happy = mood === "happy" || mood === "excited";
  const eyeColor = mood === "excited" ? "#00ff9d" : happy ? "var(--accent-primary)" : "#5aa8e0";

  return (
    <Pet3DStage mood={mood}>
      <svg
        width={64 * scale}
        height={78 * scale}
        viewBox="0 0 64 78"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          overflow: "visible",
          filter: mood === "excited" ? "drop-shadow(0 0 9px rgba(0,255,157,0.45))" : undefined,
        }}
      >
        <PetDefs id={uid} palette={PALETTE} />
        <defs>
          {/* Metal sheen — a hard linear ramp reads as a machined surface. */}
          <linearGradient id={`${uid}-metal`} x1="12%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor={PALETTE.light} />
            <stop offset="38%" stopColor={PALETTE.base} />
            <stop offset="72%" stopColor={PALETTE.dark} />
            <stop offset="100%" stopColor={PALETTE.base} />
          </linearGradient>
          {/* Emissive bloom behind the eyes/core. */}
          <radialGradient id={`${uid}-emit`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={eyeColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={eyeColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        <ContactShadow id={uid} cx={32} cy={74} rx={18} />

        {/* Antenna with an emissive tip */}
        <line x1="32" y1="5" x2="32" y2="14" stroke={PALETTE.dark} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="9" r="6" fill={`url(#${uid}-emit)`} />
        <circle cx="32" cy="4" r="3" fill={eyeColor} />
        <circle cx="31.2" cy="3.2" r="1" fill="rgba(255,255,255,0.85)" />

        {/* Head shell — bevel: outer plate, inset face plate */}
        <rect x="11" y="11" width="42" height="30" rx="7" fill={`url(#${uid}-metal)`} />
        <rect x="13.2" y="13" width="37.6" height="25.5" rx="5" fill={RECESS} />
        {/* Top bevel highlight */}
        <rect x="14" y="12.4" width="36" height="2.6" rx="1.3" fill="rgba(255,255,255,0.28)" />

        {/* Eye housings */}
        <rect x="16" y="17" width="13" height="10" rx="3" fill="#1a222c" />
        <rect x="35" y="17" width="13" height="10" rx="3" fill="#1a222c" />
        {/* Emissive bloom + lens */}
        <circle cx="22.5" cy="22" r="8" fill={`url(#${uid}-emit)`} />
        <circle cx="41.5" cy="22" r="8" fill={`url(#${uid}-emit)`} />
        <circle cx="22.5" cy="22" r="4.1" fill={eyeColor} />
        <circle cx="41.5" cy="22" r="4.1" fill={eyeColor} />
        <circle cx="21.3" cy="20.8" r="1.5" fill="rgba(255,255,255,0.8)" />
        <circle cx="40.3" cy="20.8" r="1.5" fill="rgba(255,255,255,0.8)" />

        {/* Mouth display */}
        {happy ? (
          <path
            d="M 20 33 L 24 29 L 28 33 L 32 29 L 36 33 L 40 29 L 44 33"
            stroke={eyeColor}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <rect x="20" y="31" width="24" height="2.6" rx="1.3" fill={eyeColor} opacity="0.45" />
        )}

        {/* Neck */}
        <rect x="26" y="41" width="12" height="6" rx="2" fill={PALETTE.dark} />
        <Occlusion id={uid} cx={32} cy={46} rx={11} ry={3} opacity={0.45} />

        {/* Torso */}
        <rect x="10" y="45" width="44" height="23" rx="7" fill={`url(#${uid}-metal)`} />
        <rect x="14" y="49" width="36" height="15" rx="5" fill={RECESS} />
        <rect x="12.5" y="46.4" width="39" height="2.4" rx="1.2" fill="rgba(255,255,255,0.22)" />

        {/* Chest panels + reactor core */}
        <rect x="17" y="52" width="10" height="7" rx="2.2" fill="#1a222c" />
        <rect x="37" y="52" width="10" height="7" rx="2.2" fill="#1a222c" />
        <circle cx="32" cy="55.5" r="6" fill={`url(#${uid}-emit)`} />
        <circle cx="32" cy="55.5" r="3" fill={eyeColor} opacity="0.85" />

        {/* Arms */}
        <rect x="0" y="47" width="10" height="16" rx="5" fill={`url(#${uid}-metal)`} />
        <rect x="54" y="47" width="10" height="16" rx="5" fill={`url(#${uid}-metal)`} />

        {/* Rim light — straight runs along the chassis' right edges (x=53 head,
            x=54 torso), since these forms are flat plates, not spheres. */}
        <RimLight d="M 53 19 L 53 34" width={1.8} opacity={0.45} />
        <RimLight d="M 54 52 L 54 62" width={1.8} opacity={0.38} />

        <Gloss id={uid} cx={22} cy={15} rx={9} ry={4} opacity={0.35} />
        <Gloss id={uid} cx={22} cy={49} rx={9} ry={3.5} opacity={0.28} />

        {/* Feet */}
        <rect x="16" y="66" width="12" height="8" rx="4" fill={PALETTE.dark} />
        <rect x="36" y="66" width="12" height="8" rx="4" fill={PALETTE.dark} />

        {mood === "excited" && (
          <>
            <circle cx="6" cy="30" r="2" fill={eyeColor} opacity="0.9" className="pet-sparkle" />
            <circle cx="58" cy="28" r="2" fill={eyeColor} opacity="0.9" className="pet-sparkle" style={{ animationDelay: "0.3s" }} />
            <circle cx="4" cy="44" r="1.5" fill={eyeColor} opacity="0.7" className="pet-sparkle" style={{ animationDelay: "0.15s" }} />
          </>
        )}
      </svg>
    </Pet3DStage>
  );
}
