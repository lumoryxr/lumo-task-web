import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PetSpecies } from "@/components/PetSvg";

export type PetMood = "idle" | "happy" | "excited";

interface PetStore {
  pos: { x: number; y: number };
  visible: boolean;
  activeMsg: string | null;
  mood: PetMood;
  species: PetSpecies;
  petName: string;
  setPos: (pos: { x: number; y: number }) => void;
  setMsg: (key: string | null) => void;
  setMood: (mood: PetMood) => void;
  toggleVisible: () => void;
  celebrate: (msgKey: string, durationMs?: number) => void;
  /** Brief, message-less "excited" bounce on a small positive action. */
  react: (durationMs?: number) => void;
  setSpecies: (species: PetSpecies) => void;
  setPetName: (name: string) => void;
}

function defaultPos() {
  if (typeof window === "undefined") return { x: 900, y: 600 };
  return { x: window.innerWidth - 110, y: window.innerHeight - 180 };
}

// Module-level so a rapid burst of reactions resets one shared timer instead of
// racing several — the last pulse wins and settles the mood cleanly.
let reactTimer: ReturnType<typeof setTimeout> | undefined;

export const usePetStore = create<PetStore>()(
  persist(
    (set, get) => ({
      pos: defaultPos(),
      visible: true,
      activeMsg: null,
      mood: "idle",
      species: "dog",
      petName: "",
      setPos: (pos) => set({ pos }),
      setMsg: (activeMsg) => set({ activeMsg }),
      setMood: (mood) => set({ mood }),
      toggleVisible: () => set((s) => ({ visible: !s.visible })),
      celebrate: (msgKey, durationMs = 8000) => {
        set({ activeMsg: msgKey, mood: "excited" });
        setTimeout(() => set({ activeMsg: null, mood: "idle" }), durationMs);
      },
      react: (durationMs = 1300) => {
        // Don't clobber a message/celebration that's already showing.
        if (get().activeMsg) return;
        if (reactTimer) clearTimeout(reactTimer);
        set({ mood: "excited" });
        reactTimer = setTimeout(() => {
          reactTimer = undefined;
          // Only settle if nothing else took over the message meanwhile.
          set((s) => (s.activeMsg ? s : { ...s, mood: "idle" }));
        }, durationMs);
      },
      setSpecies: (species) => set({ species }),
      setPetName: (petName) => set({ petName }),
    }),
    {
      name: "lumo-pet",
      partialize: (s) => ({ pos: s.pos, visible: s.visible, species: s.species, petName: s.petName }),
    }
  )
);
