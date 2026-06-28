import { useDogStore, getTierFromLevel, getTierName } from "@/store/useDogStore";
import { useAppStore } from "@/store/useAppStore";

const TIER_COLORS = {
  puppy:     { bg: "rgba(200,150,70,0.15)",  border: "rgba(200,150,70,0.5)",  text: "#c89645" },
  adult:     { bg: "rgba(212,160,48,0.15)",  border: "rgba(212,160,48,0.5)",  text: "#d4a030" },
  wise:      { bg: "rgba(136,153,170,0.15)", border: "rgba(136,153,170,0.5)", text: "#8899aa" },
  legendary: { bg: "rgba(160,200,255,0.15)", border: "rgba(160,200,255,0.5)", text: "#a0c8ff" },
};

export function DogEvolutionBadge() {
  const { level } = useDogStore();
  const locale = useAppStore((s) => s.locale);
  const tier = getTierFromLevel(level);
  const c = TIER_COLORS[tier];
  const tierLabel = getTierName(tier, locale as "en" | "zh");

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--radius-xl)",
        background: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: 12,
        fontWeight: 600,
        color: c.text,
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      <span>🐕</span>
      <span>Lv.{level}</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>·</span>
      <span>{tierLabel}</span>
    </div>
  );
}
