import { useRef, useState, useEffect } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/store/useToastStore";
import { isShareCancellation } from "@/utils/share";
import { useAIStore } from "@/store/useAIStore";
import { useDogStore } from "@/store/useDogStore";
import { DogSvg } from "@/components/DogSvg";
import type { PrevWeekStats } from "@/utils/wrapped";

const DAY_KEYS = [
  "stats.day.sun", "stats.day.mon", "stats.day.tue", "stats.day.wed",
  "stats.day.thu", "stats.day.fri", "stats.day.sat",
];

const QUADRANT_COLOR: Record<string, string> = {
  Q1: "var(--q1-color)",
  Q2: "var(--q2-color)",
  Q3: "var(--q3-color)",
  Q4: "var(--q4-color)",
};

interface WrappedCardProps {
  stats: PrevWeekStats;
  currentStreak: number;
  userName: string;
  onDismiss: () => void;
}

export function WrappedCard({ stats, currentStreak, userName, onDismiss }: WrappedCardProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const { level } = useDogStore();
  const fetchWrappedInsight = useAIStore((s) => s.fetchWrappedInsight);
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "downloaded">("idle");
  const [insight, setInsight] = useState<string | null>(null);

  const maxDay = Math.max(...stats.byDay, 1);

  const visibleQuadrants = stats.quadrantBreakdown.filter(
    (b) => b.count > 0 && b.quadrant !== "unclassified",
  );

  useEffect(() => {
    if (stats.tasksCompleted === 0) return;
    let cancelled = false;
    const focusHours = Math.round((stats.focusMinutes / 60) * 10) / 10;
    const getQ = (q: string) => stats.quadrantBreakdown.find((b) => b.quadrant === q)?.percent ?? 0;
    const q1Pct = getQ("Q1");
    const q2Pct = getQ("Q2");
    const q3Pct = getQ("Q3");
    const q4Pct = getQ("Q4");
    fetchWrappedInsight(
      [{
        role: "user",
        content: locale === "zh"
          ? `你是Lumo专注教练。根据以下上周数据给出三段式教练反馈，直接输出三段文字，每段之间空一行，不要标题或编号：
1. 数据解读（1-2句）：用艾森豪威尔语言解读象限分布模式
2. 行动建议（1条具体可执行的下周行动）：针对当前最突出的象限问题
3. 积极收尾（1句轻松鼓励）

数据：完成${stats.tasksCompleted}个任务，专注${focusHours}小时，Q1紧急重要${q1Pct}%，Q2重要不紧急${q2Pct}%，Q3紧急不重要${q3Pct}%，Q4不紧急不重要${q4Pct}%，连击${currentStreak}天。总字数不超过80字。`
          : `You're a Lumo focus coach. Based on last week's data, give 3-part coaching feedback. Output 3 short paragraphs separated by blank lines, no headings or numbers:
1. Data insight (1-2 sentences): Interpret quadrant distribution using Eisenhower language
2. Coaching action (1 specific, actionable next-week suggestion): Target the most prominent quadrant issue
3. Positive close (1 light, encouraging sentence)

Data: ${stats.tasksCompleted} tasks, ${focusHours}h focus, Q1 urgent+important ${q1Pct}%, Q2 important ${q2Pct}%, Q3 urgent ${q3Pct}%, Q4 low-priority ${q4Pct}%, ${currentStreak}-day streak. Max 60 words total.`,
      }],
      { page: "stats", locale },
    ).then((reply) => { if (!cancelled && reply) setInsight(reply); });
    return () => { cancelled = true; };
  }, [stats, currentStreak, locale, fetchWrappedInsight]);

  async function handleShare() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
        logging: false,
      });
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), "image/png")
      );
      const file = new File([blob], "lumo-wrapped.png", { type: "image/png" });
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t("wrapped.share.title") });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lumo-wrapped.png";
        a.click();
        URL.revokeObjectURL(url);
        setFeedback("downloaded");
        setTimeout(() => setFeedback("idle"), 2500);
      }
    } catch (e) {
      // A dismissed share sheet is a normal cancellation; anything else is a
      // real export failure the user should know about.
      if (!isShareCancellation(e)) toast.error(t("wrapped.share.error"));
    } finally {
      setBusy(false);
    }
  }

  const btnLabel = busy
    ? t("stats.share.busy")
    : feedback === "downloaded"
    ? t("stats.share.downloaded")
    : t("wrapped.share.btn");

  return (
    <div style={{ maxWidth: 400 }}>
      {/* Captured area */}
      <div
        ref={cardRef}
        style={{
          background: "linear-gradient(160deg, var(--bg-elevated) 0%, var(--bg-base) 100%)",
          border: "1px solid var(--border-default)",
          borderRadius: 20,
          padding: "28px 28px 20px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 2 }}>
              {userName ? `${userName} · ` : ""}{t("wrapped.title")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{stats.weekLabel}</div>
          </div>
          <DogSvg mood="happy" size={44} level={level} />
        </div>

        {/* Big stat row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 12, background: "var(--bg-deep)" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-primary)", lineHeight: 1 }}>
              {stats.tasksCompleted}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>{t("stats.tasks")}</div>
          </div>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 12, background: "var(--bg-deep)" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-primary)", lineHeight: 1 }}>
              {(stats.focusMinutes / 60).toFixed(1)}h
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>{t("stats.focus")}</div>
          </div>
          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 12, background: "var(--bg-deep)" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-primary)", lineHeight: 1 }}>
              🔥{currentStreak}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>{t("stats.streak")}</div>
          </div>
        </div>

        {/* Quadrant distribution — only when tasks were completed and at least one classified */}
        {stats.tasksCompleted > 0 && visibleQuadrants.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 6, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {t("wrapped.quadrant.section")}
            </div>
            {/* Proportional color bar */}
            <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 2, marginBottom: 7 }}>
              {visibleQuadrants.map((b) => (
                <div
                  key={b.quadrant}
                  style={{
                    flex: b.percent,
                    background: QUADRANT_COLOR[b.quadrant],
                    borderRadius: 3,
                    minWidth: 4,
                  }}
                />
              ))}
            </div>
            {/* Labels */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
              {visibleQuadrants.map((b) => (
                <span key={b.quadrant} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600, color: QUADRANT_COLOR[b.quadrant] }}>{b.quadrant}</span>
                  {" "}{b.percent}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* AI insight */}
        {insight && (
          <div style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(var(--accent-primary-rgb,61,255,160),0.08)",
            border: "1px solid var(--accent-dim)",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 16,
            lineHeight: 1.6,
            whiteSpace: "pre-line",
          }}>
            {insight}
          </div>
        )}

        {/* Day bar chart */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 16, height: 36 }}>
          {stats.byDay.map((count, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: "100%",
                borderRadius: 2,
                height: count === 0 ? 3 : `${Math.max(6, (count / maxDay) * 26)}px`,
                background: count > 0 ? "var(--accent-primary)" : "var(--bg-elevated)",
                opacity: count > 0 ? 0.7 + (count / maxDay) * 0.3 : 0.3,
              }} />
              <span style={{ fontSize: 8, color: "var(--text-faint)" }}>{t(DAY_KEYS[i])}</span>
            </div>
          ))}
        </div>

        {/* Brand footer */}
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>lumo.app</div>
      </div>

      {/* Action buttons — outside captured area */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
        <button
          onClick={handleShare}
          disabled={busy}
          className="btn btn-primary"
          style={{ minWidth: 100 }}
        >
          {btnLabel}
        </button>
        <button onClick={onDismiss} className="btn btn-ghost">
          {t("wrapped.dismiss")}
        </button>
      </div>
    </div>
  );
}
