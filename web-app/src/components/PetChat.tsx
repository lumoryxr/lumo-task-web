import { useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useT, useLocaleString } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useAIStore } from "@/store/useAIStore";
import { useTasksStore } from "@/store/useTasksStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { PetSpecies } from "@/components/PetSvg";
import { getSpeciesEmoji } from "@/components/PetSvg";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Props {
  petPos: { x: number; y: number };
  species?: PetSpecies;
  petName?: string;
}

const QUICK_CHIPS_EN = [
  { key: "ai.chip.tasks",    text: "list tasks" },
  { key: "ai.chip.today",    text: "today's tasks" },
  { key: "ai.chip.priority", text: "What's my priority?" },
  { key: "ai.chip.stats",    text: "today's stats" },
];

const QUICK_CHIPS_ZH = [
  { key: "ai.chip.tasks",    text: "我的任务" },
  { key: "ai.chip.today",    text: "今天的任务" },
  { key: "ai.chip.priority", text: "今日优先级" },
  { key: "ai.chip.stats",    text: "今日进度" },
];

export function PetChat({ petPos, species = "dog", petName = "" }: Props) {
  const t = useT();
  const ls = useLocaleString();
  const locale = useAppStore((s) => s.locale);
  const location = useLocation();
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const { messages, loading, chatOpen, closeChat, sendMessage, clearHistory, activeProvider, providerConfigs } = useAIStore();
  const tasks = useTasksStore((s) => s.tasks);
  const completed = useTasksStore((s) => s.completed);
  const user = useAuthStore((s) => s.user);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build activity context for each message
  const context = useMemo(() => {
    const activeTasks = tasks.filter((tk) => !tk.completed);
    return {
      page: location.pathname,
      todayTasks: activeTasks
        .filter((tk) => tk.today)
        .slice(0, 10)
        .map((tk) => ({ id: tk.id, title: ls(tk.title), quadrant: tk.quadrant })),
      q1Count: activeTasks.filter((tk) => tk.quadrant === "Q1").length,
      recentCompleted: completed
        .slice(0, 3)
        .map((e) => ({ title: ls(e.title), completedAt: e.completedAt ?? "" })),
      locale,
      userName: user?.name ?? undefined,
      species,
      petName: petName || undefined,
    };
  }, [tasks, completed, location.pathname, locale, user, species, petName]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [chatOpen]);

  // Keyboard dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // While the clear-history confirm is up, let its own Esc handler cancel it
        // instead of also collapsing/closing the chat behind it.
        if (confirmClear) return;
        if (maximized) setMaximized(false);
        else closeChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeChat, maximized, confirmClear]);

  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (!text || loading) return;
    if (inputRef.current) inputRef.current.value = "";
    sendMessage(text, context);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChip = (text: string) => {
    sendMessage(text, context);
  };

  // Panel dimensions
  const NORMAL_W = 400;
  const NORMAL_H = 540;
  const MAX_W = Math.min(680, window.innerWidth - 24);
  const MAX_H = Math.min(740, window.innerHeight - 24);
  const MARGIN = 12;

  const panelW = maximized ? MAX_W : NORMAL_W;
  const panelH = maximized ? MAX_H : NORMAL_H;

  // Centered when maximized, otherwise left of pet
  let panelLeft: number;
  let panelTop: number;
  if (maximized) {
    panelLeft = Math.round((window.innerWidth - panelW) / 2);
    panelTop = Math.round((window.innerHeight - panelH) / 2);
  } else {
    const rawLeft = petPos.x - panelW - MARGIN;
    const rawTop = petPos.y - panelH + 60;
    panelLeft = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - panelW - MARGIN));
    panelTop = Math.max(MARGIN, Math.min(rawTop, window.innerHeight - panelH - MARGIN));
  }

  const chips = locale === "zh" ? QUICK_CHIPS_ZH : QUICK_CHIPS_EN;
  const hasConfig = providerConfigs[activeProvider]?.hasKey ?? false;
  const emoji = getSpeciesEmoji(species);
  const displayName = petName || (locale === "zh" ? t(`pet.species.${species}.zh`) : t(`pet.species.${species}.en`));

  if (!chatOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("pet.chat.title")}
      className="fade-in"
      style={{
        position: "fixed",
        left: panelLeft,
        top: panelTop,
        width: panelW,
        height: panelH,
        zIndex: 9997,
        display: "flex",
        flexDirection: "column",
        borderRadius: maximized ? 18 : 14,
        overflow: "hidden",
        border: "1px solid var(--accent-edge)",
        background: "var(--bg-elevated)",
        boxShadow: "var(--shadow-lifted), 0 0 40px var(--accent-fog)",
        transition: "width 0.2s ease, height 0.2s ease, border-radius 0.2s ease",
      }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-2 flex-shrink-0"
        style={{
          padding: "10px 12px 10px 14px",
          borderBottom: "1px solid var(--border-faint)",
          background: "var(--bg-surface)",
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary leading-none">
            {displayName}
          </div>
          <div className="text-[10px] text-text-faint mt-0.5">
            {t("ai.chat.subtitle")}
            {!hasConfig && (
              <span style={{ color: "var(--accent-primary)" }}> · {t("ai.chat.basicMode")}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setConfirmClear(true)}
          title={t("ai.chat.clear")}
          className="text-[10px] text-text-faint hover:text-text-muted transition-colors px-1.5 py-0.5 rounded"
        >
          {t("ai.chat.clear")}
        </button>
        {/* Maximize / restore toggle */}
        <button
          onClick={() => setMaximized((m) => !m)}
          title={maximized ? t("ai.chat.restore") : t("ai.chat.maximize")}
          className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:bg-subtle hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
          aria-label={maximized ? t("ai.chat.restore") : t("ai.chat.maximize")}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1" y="4" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 4V2a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 3L3 7M3 4v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button
          onClick={closeChat}
          className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:bg-subtle hover:text-text-primary transition-colors"
          style={{ border: "1px solid var(--border-default)" }}
          aria-label={t("qc.close")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Setup banner when AI not configured */}
      {!hasConfig && (
        <button
          onClick={() => { closeChat(); navigate("/settings"); }}
          className="flex-shrink-0 text-[11px] font-medium text-center transition-colors"
          style={{
            padding: "6px 12px",
            background: "var(--accent-fog)",
            color: "var(--accent-primary)",
            borderBottom: "1px solid var(--accent-edge)",
          }}
        >
          {t("ai.setup.banner")}
        </button>
      )}

      {/* Quick chips */}
      <div
        className="flex gap-1.5 flex-shrink-0 overflow-x-auto"
        style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-faint)", scrollbarWidth: "none" }}
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => handleChip(chip.text)}
            disabled={loading}
            className="flex-shrink-0 text-[11px] rounded-full transition-colors"
            style={{
              padding: "3px 10px",
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-edge)";
                (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
            }}
          >
            {chip.text}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto flex flex-col gap-2"
        style={{ padding: "12px", scrollbarWidth: "thin" }}
      >
        {messages.length === 0 && (
          <div className="text-[12px] text-text-faint italic text-center" style={{ marginTop: 20 }}>
            {t("pet.chat.empty")}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className="flex flex-col"
            style={{ alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}
          >
            <div
              className="text-[12px] leading-relaxed"
              style={{
                maxWidth: "82%",
                padding: "8px 11px",
                borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                background: msg.role === "user" ? "var(--accent-primary)" : "var(--bg-subtle)",
                color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                border: msg.role === "user" ? "none" : "1px solid var(--border-faint)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
            </div>
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div
                className="flex flex-wrap gap-1 mt-1"
                style={{ maxWidth: "82%" }}
              >
                {[...new Set(msg.toolsUsed)].map((tool) => (
                  <span
                    key={tool}
                    className="text-[10px] rounded-full"
                    style={{
                      padding: "2px 7px",
                      background: "var(--accent-fog)",
                      color: "var(--accent-primary)",
                      border: "1px solid var(--accent-edge)",
                    }}
                  >
                    ⚙ {tool.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex" style={{ justifyContent: "flex-start" }}>
            <div
              className="text-[12px]"
              style={{
                padding: "8px 12px",
                borderRadius: "12px 12px 12px 3px",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-faint)",
                color: "var(--text-faint)",
              }}
            >
              <ThinkingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-end gap-2 flex-shrink-0"
        style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--border-faint)",
          background: "var(--bg-surface)",
        }}
      >
        <textarea
          ref={inputRef}
          onKeyDown={handleKeyDown}
          placeholder={t("ai.chat.placeholder")}
          aria-label={t("ai.chat.placeholder")}
          rows={1}
          disabled={loading}
          className="flex-1 resize-none text-[12px] text-text-primary bg-transparent outline-none"
          style={{
            border: "none",
            lineHeight: 1.5,
            maxHeight: 96,
            overflowY: "auto",
            scrollbarWidth: "none",
            color: "var(--text-primary)",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 96) + "px";
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="flex-shrink-0 flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 32,
            height: 32,
            background: loading ? "var(--bg-subtle)" : "var(--accent-primary)",
            color: loading ? "var(--text-faint)" : "#fff",
            border: "none",
            cursor: loading ? "default" : "pointer",
          }}
          aria-label={t("ai.chat.send")}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 12L12 6.5L1 1v4.5l7.5 2L1 7.5V12z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <ConfirmDialog
        open={confirmClear}
        danger
        title={t("ai.chat.clear.confirm.title")}
        message={t("ai.chat.clear.confirm")}
        confirmLabel={t("ai.chat.clear")}
        onConfirm={() => { clearHistory(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>,
    document.body
  );
}

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--text-faint)",
            display: "inline-block",
            animation: `petBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
