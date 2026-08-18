import { useId } from "react";
import { getTierFromLevel } from "@/store/useDogStore";
import type { DogTier } from "@/store/useDogStore";
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

/** Each evolution tier gets a full light/base/shadow ramp, not one flat fill. */
const PALETTE: Record<DogTier, PetPalette> = {
  puppy: { base: "#c89645", light: "#f2c479", dark: "#87611f", belly: "#e8c870", bellyLight: "#fae6ad" },
  adult: { base: "#d4a030", light: "#ffd06c", dark: "#946a14", belly: "#f0d080", bellyLight: "#fff0bc" },
  wise: { base: "#8899aa", light: "#c0cfe0", dark: "#566474", belly: "#b8cce0", bellyLight: "#e4effa" },
  legendary: { base: "#dfe9ff", light: "#ffffff", dark: "#a3b8e6", belly: "#ffffff", bellyLight: "#ffffff" },
};

const EAR_INNER = "#7a4a2a";
const NOSE = "#1c1210";

/** Adult tier — a knitted scarf, shaded so it wraps the neck instead of sitting flat. */
function Scarf({ id }: { id: string }) {
  return (
    <g>
      <ellipse cx="32" cy="41.5" rx="15" ry="5.2" fill="#c8401e" />
      <ellipse cx="30" cy="40.4" rx="11" ry="3.2" fill="#f06a42" opacity="0.75" />
      <path d="M 43 42 Q 47 47 44.5 52" stroke="#c8401e" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <Occlusion id={id} cx={32} cy={44.5} rx={13} ry={2.6} opacity={0.35} />
    </g>
  );
}

/** Wise tier — wire spectacles with a glass sheen. */
function Glasses({ id }: { id: string }) {
  return (
    <g>
      <circle cx="24" cy="21" r="6.4" fill="rgba(180,220,255,0.14)" />
      <circle cx="40" cy="21" r="6.4" fill="rgba(180,220,255,0.14)" />
      <circle cx="24" cy="21" r="6.4" fill="none" stroke="#8fb4d6" strokeWidth="1.6" />
      <circle cx="40" cy="21" r="6.4" fill="none" stroke="#8fb4d6" strokeWidth="1.6" />
      <path d="M 30.4 21 Q 32 19.6 33.6 21" stroke="#8fb4d6" strokeWidth="1.6" fill="none" />
      {/* Lens glare */}
      <path d="M 20.5 18 L 24 16.4" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 36.5 18 L 40 16.4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
      <Gloss id={id} cx={21.5} cy={18.5} rx={3} ry={2} opacity={0.4} />
    </g>
  );
}

/** Legendary tier — a gold crown with faceted shading and jewels. */
function Crown({ id }: { id: string }) {
  return (
    <g>
      <polygon points="32,0 25,11 32,8 39,11" fill="#e0a808" />
      <polygon points="32,0 32,8 39,11" fill="#fbd04e" opacity="0.85" />
      <rect x="23.5" y="9.5" width="17" height="5.5" rx="2.2" fill="#e0a808" />
      <rect x="23.5" y="9.5" width="17" height="2.4" rx="1.2" fill="#fbd868" opacity="0.8" />
      <circle cx="26" cy="10" r="2" fill="#ff5252" />
      <circle cx="32" cy="7.6" r="2" fill="#4d94ff" />
      <circle cx="38" cy="10" r="2" fill="#4ecb71" />
      <circle cx="25.4" cy="9.3" r="0.7" fill="rgba(255,255,255,0.8)" />
      <Gloss id={id} cx={28} cy={11} rx={5} ry={2.4} opacity={0.5} />
    </g>
  );
}

export function DogSvg({ mood, size = 64, level = 1 }: { mood: string; size?: number; level?: number }) {
  const uid = useId().replace(/:/g, "");
  const scale = size / 64;
  const tier = getTierFromLevel(level);
  const p = PALETTE[tier];
  const isLegendary = tier === "legendary";
  const happy = mood === "happy" || mood === "excited";

  return (
    <Pet3DStage mood={mood}>
      <svg
        width={64 * scale}
        height={76 * scale}
        viewBox="0 0 64 76"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          overflow: "visible",
          filter: isLegendary ? "drop-shadow(0 0 12px rgba(160,200,255,0.6))" : undefined,
        }}
      >
        <PetDefs id={uid} palette={p} />

        <ContactShadow id={uid} cx={32} cy={71} rx={19} />

        {/* Rear legs sit behind the body mass */}
        <rect x="11" y="53" width="10" height="15" rx="5" fill={`url(#${uid}-limb)`} />
        <rect x="43" y="53" width="10" height="15" rx="5" fill={`url(#${uid}-limb)`} />

        {/* Tail */}
        <path
          className="pet-tail"
          d="M 50 43 Q 62 35 58 22 Q 56 15 50 18"
          stroke={p.dark}
          strokeWidth="7.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Body */}
        <ellipse cx="32" cy="46" rx="21" ry="15" fill={`url(#${uid}-vol)`} />
        <ellipse cx="32" cy="49" rx="13" ry="9" fill={`url(#${uid}-belly)`} opacity="0.7" />
        <Occlusion id={uid} cx={32} cy={62} rx={16} ry={4} opacity={0.3} />

        {/* Ears */}
        <polygon points="14,18 7,0 23,7" fill={`url(#${uid}-limb)`} />
        <polygon points="15.5,16.5 10.5,5 22,9" fill={EAR_INNER} opacity="0.7" />
        <polygon points="50,18 57,0 41,7" fill={`url(#${uid}-limb)`} />
        <polygon points="48.5,16.5 53.5,5 42,9" fill={EAR_INNER} opacity="0.55" />

        <Occlusion id={uid} cx={32} cy={40} rx={14} ry={4.5} opacity={0.38} />

        {/* Head */}
        <circle cx="32" cy="24" r="18" fill={`url(#${uid}-vol)`} />
        <ellipse cx="32" cy="27.5" rx="12" ry="10.5" fill={`url(#${uid}-belly)`} opacity="0.78" />

        {/* Rim light — arcs traced along the real head/body silhouettes */}
        <RimLight d="M 42.32 9.26 A 18 18 0 0 1 43.57 37.79" width={2} opacity={0.5} />
        <RimLight d="M 48.09 36.36 A 21 15 0 0 1 46.85 56.61" width={1.8} opacity={0.34} />

        <Gloss id={uid} cx={23.5} cy={14.5} rx={8.5} ry={6.5} opacity={0.5} />
        <Gloss id={uid} cx={25} cy={41} rx={8} ry={5} opacity={0.28} />

        {/* Eyes — keep the blink classes so the existing blink loop still applies */}
        <g className="pet-eye-l" style={{ transformOrigin: "24px 21px" }}>
          <GlossyEye id={uid} cx={24} cy={21} r={5.3} look={0.9} happy={happy} />
        </g>
        <g className="pet-eye-r" style={{ transformOrigin: "40px 21px" }}>
          <GlossyEye id={uid} cx={40} cy={21} r={5.3} look={0.9} happy={happy} />
        </g>

        {/* Nose */}
        <ellipse cx="32" cy="29" rx="4.1" ry="3.1" fill={NOSE} />
        <circle cx="30.7" cy="28" r="1.05" fill="rgba(255,255,255,0.55)" />

        {/* Mouth */}
        <path
          d={happy ? "M 27 33 Q 32 38.2 37 33" : "M 28 33 Q 32 36 36 33"}
          stroke={NOSE}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cheek blush */}
        <ellipse cx="18" cy="29" rx="4.8" ry="3.4" fill="var(--accent-primary)" opacity="0.22" />
        <ellipse cx="46" cy="29" rx="4.8" ry="3.4" fill="var(--accent-primary)" opacity="0.16" />

        {/* Front legs */}
        <rect x="20" y="56" width="10" height="13" rx="5" fill={`url(#${uid}-limb)`} />
        <rect x="34" y="56" width="10" height="13" rx="5" fill={`url(#${uid}-limb)`} />

        {/* Tier accessories */}
        {tier === "adult" && <Scarf id={uid} />}
        {tier === "wise" && <Glasses id={uid} />}
        {tier === "legendary" && <Crown id={uid} />}

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
