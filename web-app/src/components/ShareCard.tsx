import { useRef, useState } from "react";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/store/useToastStore";
import { isShareCancellation } from "@/utils/share";

const DAY_KEYS = [
  "stats.day.sun", "stats.day.mon", "stats.day.tue", "stats.day.wed",
  "stats.day.thu", "stats.day.fri", "stats.day.sat",
];

interface ShareCardProps {
  tasksCompleted: number;
  focusHours: string;
  currentStreak: number;
  byDay: number[];
  userName: string;
  weekLabel: string;
}

export function ShareCard({
  tasksCompleted,
  focusHours,
  currentStreak,
  byDay,
  userName,
  weekLabel,
}: ShareCardProps) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "downloaded">("idle");

  const maxDay = Math.max(...byDay, 1);

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
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error("Canvas export failed"))),
          "image/png"
        )
      );
      const file = new File([blob], "lumo-weekly.png", { type: "image/png" });

      if (
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: t("stats.share.title") });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lumo-weekly.png";
        a.click();
        URL.revokeObjectURL(url);
        setFeedback("downloaded");
        setTimeout(() => setFeedback("idle"), 2500);
      }
    } catch (e) {
      // A dismissed share sheet is a normal cancellation; anything else is a
      // real export failure the user should know about.
      if (!isShareCancellation(e)) toast.error(t("stats.share.error"));
    } finally {
      setBusy(false);
    }
  }

  const btnLabel =
    busy
      ? locale === "zh" ? "生成中…" : "Exporting…"
      : feedback === "downloaded"
      ? t("stats.share.downloaded")
      : t("stats.share.btn");

  return (
    <div>
      {/* Captured area */}
      <div
        ref={cardRef}
        className="relative rounded-2xl p-6 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)",
          border: "1px solid var(--accent-edge)",
          boxShadow: "0 0 40px var(--accent-fog)",
        }}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 80% 20%, var(--accent-glow) 0%, transparent 60%)",
            opacity: 0.3,
          }}
        />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-1">
                Lumo Task
              </div>
              <div className="text-[16px] font-bold text-text-primary">
                {t("stats.share.title")}
              </div>
              <div className="text-[12px] text-text-muted mt-0.5">
                {weekLabel} · {userName}
              </div>
            </div>
            {/* Lumo glyph */}
            <div className="lumo-glyph flex-shrink-0" style={{ width: 28, height: 28 }}>
              <div className="halo" />
              <div className="core" />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div
                className="text-[24px] font-bold tabular-nums"
                style={{ color: "var(--accent-primary)" }}
              >
                {tasksCompleted}
              </div>
              <div className="text-[10px] text-text-faint mt-0.5">{t("stats.tasks")}</div>
            </div>
            <div className="text-center">
              <div
                className="text-[24px] font-bold tabular-nums"
                style={{ color: "var(--accent-primary)" }}
              >
                {focusHours}
                <span className="text-[14px]">h</span>
              </div>
              <div className="text-[10px] text-text-faint mt-0.5">{t("stats.focus")}</div>
            </div>
            <div className="text-center">
              <div
                className="text-[24px] font-bold tabular-nums"
                style={{ color: "var(--accent-primary)" }}
              >
                🔥{currentStreak}
              </div>
              <div className="text-[10px] text-text-faint mt-0.5">{t("stats.streak")}</div>
            </div>
          </div>

          {/* Mini daily bar chart */}
          <div className="flex items-end gap-1.5 mb-4">
            {byDay.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: count === 0 ? 3 : `${Math.max(6, (count / maxDay) * 28)}px`,
                    background:
                      count > 0 ? "var(--accent-primary)" : "var(--bg-elevated)",
                    opacity: count > 0 ? 0.8 + (count / maxDay) * 0.2 : 0.3,
                  }}
                />
                <span className="text-[8px] text-text-faint">{t(DAY_KEYS[i])}</span>
              </div>
            ))}
          </div>

          {/* Brand footer */}
          <div
            className="text-center text-[11px] font-medium"
            style={{ color: "var(--text-faint)" }}
          >
            lumo.app
          </div>
        </div>
      </div>

      {/* Share button — outside captured area */}
      <div className="flex justify-center mt-4">
        <button
          onClick={handleShare}
          disabled={busy}
          aria-label={t("stats.share.btn")}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold transition-all disabled:opacity-50"
          style={{
            background: "var(--accent-primary)",
            color: "var(--bg-base)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
