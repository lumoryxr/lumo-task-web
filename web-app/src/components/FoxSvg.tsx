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

/** Warm fox orange — the brand mark's species, so it carries the richest ramp. */
const PALETTE: PetPalette = {
  base: "#e0701e",
  light: "#ffab5e",
  dark: "#95400f",
  belly: "#fae0bd",
  bellyLight: "#fff8ee",
};

const EAR_INNER = "#3a2418";
const NOSE = "#241612";
const MOUTH = "#241612";

export function FoxSvg({ mood, size = 64 }: { mood: string; size?: number }) {
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

        <ContactShadow id={uid} cx={32} cy={71} rx={18} />

        {/* Bushy tail — dark root, warm mid, white tip, drawn behind the body */}
        <path
          d="M 51 45 Q 66 33 62 20 Q 60 11 53 15"
          stroke={PALETTE.dark}
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
          className="pet-tail"
        />
        <path
          d="M 52 45 Q 65 34 61 21"
          stroke={PALETTE.base}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          className="pet-tail"
        />
        <path
          d="M 60.5 16 Q 64 12 61 19"
          stroke={PALETTE.bellyLight ?? "#ffffff"}
          strokeWidth="5.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Body */}
        <ellipse cx="32" cy="47" rx="20" ry="14" fill={`url(#${uid}-vol)`} />
        <ellipse cx="32" cy="50" rx="12" ry="9" fill={`url(#${uid}-belly)`} opacity="0.9" />
        <rect x="12" y="55" width="9" height="14" rx="4.5" fill={`url(#${uid}-limb)`} />
        <rect x="43" y="55" width="9" height="14" rx="4.5" fill={`url(#${uid}-limb)`} />
        <Occlusion id={uid} cx={32} cy={62} rx={16} ry={4} opacity={0.32} />

        {/* Ears — tall triangles with dark inner cartilage */}
        <polygon points="15,15 8,-1 23,8" fill={`url(#${uid}-limb)`} />
        <polygon points="16,13.5 12,2.5 21.5,9" fill={EAR_INNER} opacity="0.8" />
        <polygon points="49,15 56,-1 41,8" fill={`url(#${uid}-limb)`} />
        <polygon points="48,13.5 52,2.5 42.5,9" fill={EAR_INNER} opacity="0.65" />

        <Occlusion id={uid} cx={32} cy={40} rx={13.5} ry={4.5} opacity={0.4} />

        {/* Head */}
        <circle cx="32" cy="24" r="18" fill={`url(#${uid}-vol)`} />
        {/* Cream muzzle mask — the fox's signature */}
        <ellipse cx="32" cy="29.5" rx="11.5" ry="10" fill={`url(#${uid}-belly)`} opacity="0.95" />

        {/* Rim light — arcs traced along the real head/body silhouettes */}
        <RimLight d="M 42.32 9.26 A 18 18 0 0 1 43.57 37.79" width={2} opacity={0.5} />
        <RimLight d="M 47.32 38 A 20 14 0 0 1 46.14 56.9" width={1.8} opacity={0.34} />

        <Gloss id={uid} cx={23.5} cy={14.5} rx={8.5} ry={6.5} opacity={0.5} />
        <Gloss id={uid} cx={25} cy={42} rx={7.5} ry={4.5} opacity={0.28} />

        {/* Eyes */}
        <GlossyEye id={uid} cx={24} cy={21} r={5.4} look={0.9} happy={happy} />
        <GlossyEye id={uid} cx={40} cy={21} r={5.4} look={0.9} happy={happy} />

        {/* Nose */}
        <ellipse cx="32" cy="29.5" rx="3.6" ry="2.7" fill={NOSE} />
        <circle cx="30.8" cy="28.6" r="0.95" fill="rgba(255,255,255,0.6)" />

        {/* Mouth */}
        <path
          d={happy ? "M 27.8 32.5 Q 32 37.4 36.2 32.5" : "M 29 32.6 Q 32 35.2 35 32.6"}
          stroke={MOUTH}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cheek blush */}
        <ellipse cx="19" cy="28.5" rx="4.6" ry="3.2" fill="#ff7a5c" opacity="0.3" />
        <ellipse cx="45" cy="28.5" rx="4.6" ry="3.2" fill="#ff7a5c" opacity="0.22" />

        {/* Front paws */}
        <rect x="21" y="56" width="9" height="12" rx="4.5" fill={`url(#${uid}-limb)`} />
        <rect x="34" y="56" width="9" height="12" rx="4.5" fill={`url(#${uid}-limb)`} />

        {mood === "excited" && (
          <>
            <circle cx="8" cy="12" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" />
            <circle cx="56" cy="10" r="2" fill="var(--accent-primary)" opacity="0.9" className="pet-sparkle" style={{ animationDelay: "0.3s" }} />
            <circle cx="4" cy="30" r="1.5" fill="var(--accent-primary)" opacity="0.7" className="pet-sparkle" style={{ animationDelay: "0.15s" }} />
          </>
        )}
      </svg>
    </Pet3DStage>
  );
}
