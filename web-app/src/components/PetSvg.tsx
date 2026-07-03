import { DogSvg } from "@/components/DogSvg";
import { CatSvg } from "@/components/CatSvg";
import { FoxSvg } from "@/components/FoxSvg";
import { PandaSvg } from "@/components/PandaSvg";
import { RobotSvg } from "@/components/RobotSvg";

export type PetSpecies = "dog" | "cat" | "fox" | "panda" | "robot";

// Species labels are routed through the i18n dict (settings.pet.species.<value>),
// not held inline here, so translators/guards see them.
export const PET_SPECIES_LIST: { value: PetSpecies; emoji: string }[] = [
  { value: "dog",   emoji: "🐕" },
  { value: "cat",   emoji: "🐱" },
  { value: "fox",   emoji: "🦊" },
  { value: "panda", emoji: "🐼" },
  { value: "robot", emoji: "🤖" },
];

export function getSpeciesEmoji(species: PetSpecies): string {
  return PET_SPECIES_LIST.find((s) => s.value === species)?.emoji ?? "🐕";
}

interface PetSvgProps {
  species?: PetSpecies;
  mood: string;
  size?: number;
  level?: number;
}

export function PetSvg({ species = "dog", mood, size = 64, level = 1 }: PetSvgProps) {
  switch (species) {
    case "dog":   return <DogSvg mood={mood} size={size} level={level} />;
    case "cat":   return <CatSvg mood={mood} size={size} />;
    case "fox":   return <FoxSvg mood={mood} size={size} />;
    case "panda": return <PandaSvg mood={mood} size={size} />;
    case "robot": return <RobotSvg mood={mood} size={size} />;
    default:      return <DogSvg mood={mood} size={size} level={level} />;
  }
}
