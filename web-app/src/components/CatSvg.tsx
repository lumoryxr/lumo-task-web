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

/** Silver tabby. Cool grey so the accent rim light reads strongly against it. */
const PALETTE: PetPalette = {
  base: "#a9a9b4",
  light: "#dcdce6",
  dark: "#61616d",
  belly: "#e6e6ee",
  bellyLight: "#ffffff",
};

const EAR_INNER = "#f0a8bc";
const NOSE = "#e8748f";
const MOUTH = "#2a2028";

export function CatSvg({ mood, size = 64 }: { mood: string; size?: number }) {
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

        {/* Ground contact shadow — anchors the float. */}
        <ContactShadow id={uid} cx={32} cy={71} rx={17} />

        {/* Tail — drawn behind the body, with a darker root for depth. */}
        <path
          d="M 49 49 Q 62 39 60 26 Q 58 17 51 21"
          stroke={PALETTE.dark}
          strokeWidth="7.5"
          strokeLinecap="round"
          fill="none"
          className="pet-tail"
        />

        {/* Body mass */}
        <ellipse cx="32" cy="48" rx="18.5" ry="13.5" fill={`url(#${uid}-vol)`} />
        {/* Belly patch, slightly forward of the body's core shadow */}
        <ellipse cx="32" cy="51" rx="11" ry="8" fill={`url(#${uid}-belly)`} opacity="0.85" />
        {/* Rear legs, tucked under and darker (less key light reaches them) */}
        <rect x="13" y="55" width="9" height="14" rx="4.5" fill={`url(#${uid}-limb)`} />
        <rect x="42" y="55" width="9" height="14" rx="4.5" fill={`url(#${uid}-limb)`} />
        <Occlusion id={uid} cx={32} cy={62} rx={15} ry={4} opacity={0.3} />

        {/* Ears — outer shell then inner cartilage, both lit from the same angle */}
        <polygon points="15,14 10,-1 23,8" fill={`url(#${uid}-limb)`} />
        <polygon points="16.5,13 12.5,3 21,9" fill={EAR_INNER} opacity="0.85" />
        <polygon points="49,14 54,-1 41,8" fill={`url(#${uid}-limb)`} />
        <polygon points="47.5,13 51.5,3 43,9" fill={EAR_INNER} opacity="0.7" />

        {/* Ambient occlusion where the head sits on the body */}
        <Occlusion id={uid} cx={32} cy={40} rx={13} ry={4.5} opacity={0.4} />

        {/* Head mass */}
        <circle cx="32" cy="24" r="17.5" fill={`url(#${uid}-vol)`} />
        {/* Muzzle/cheek plane catching bounce light */}
        <ellipse cx="32" cy="28.5" rx="10.5" ry="9" fill={`url(#${uid}-belly)`} opacity="0.72" />

        {/* Accent rim light down the shadow side — the main "3D render" cue.
            Traced as arcs along the actual head/body silhouettes so the light
            sits ON the edge; a chord drawn inside the form reads as a painted
            stripe instead of a rim. */}
        <RimLight d="M 42.04 9.67 A 17.5 17.5 0 0 1 43.25 37.4" width={2} opacity={0.5} />
        <RimLight d="M 46.17 39.32 A 18.5 13.5 0 0 1 45.08 57.55" width={1.8} opacity={0.34} />

        {/* Specular highlights on the lit side */}
        <Gloss id={uid} cx={24} cy={15} rx={8} ry={6} opacity={0.55} />
        <Gloss id={uid} cx={25} cy={43} rx={7} ry={4.5} opacity={0.3} />

        {/* Eyes */}
        <GlossyEye id={uid} cx={23.5} cy={22} r={5.2} look={0.8} happy={happy} />
        <GlossyEye id={uid} cx={40.5} cy={22} r={5.2} look={0.8} happy={happy} />

        {/* Nose — small gloss keeps it wet-looking */}
        <path d="M 32 28.6 L 28.8 31.4 L 35.2 31.4 Z" fill={NOSE} />
        <circle cx="31" cy="29.4" r="0.9" fill="rgba(255,255,255,0.6)" />

        {/* Mouth */}
        <path
          d={happy ? "M 28.5 32 Q 32 36.4 35.5 32" : "M 29 32.6 Q 32 34.8 35 32.6"}
          stroke={MOUTH}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Whiskers */}
        <g stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeLinecap="round">
          <path d="M 10 26.5 Q 17 27.5 23.5 29" />
          <path d="M 10 31 Q 17 31 23.5 31.2" />
          <path d="M 54 26.5 Q 47 27.5 40.5 29" />
          <path d="M 54 31 Q 47 31 40.5 31.2" />
        </g>

        {/* Cheek blush */}
        <ellipse cx="18.5" cy="29.5" rx="4.2" ry="3" fill={NOSE} opacity="0.28" />
        <ellipse cx="45.5" cy="29.5" rx="4.2" ry="3" fill={NOSE} opacity="0.22" />

        {/* Front paws */}
        <rect x="21" y="56" width="9" height="12" rx="4.5" fill={`url(#${uid}-limb)`} />
        <rect x="34" y="56" width="9" height="12" rx="4.5" fill={`url(#${uid}-limb)`} />

        {/* Excited sparkles */}
        {mood === "excited" && (
          <>
            <circle cx="8" cy="12" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" />
            <circle cx="56" cy="10" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" style={{ animationDelay: "0.3s" }} />
            <circle cx="5" cy="31" r="1.5" fill="var(--accent-primary)" opacity="0.7" className="pet-sparkle" style={{ animationDelay: "0.15s" }} />
          </>
        )}
      </svg>
    </Pet3DStage>
  );
}
