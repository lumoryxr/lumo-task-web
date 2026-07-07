import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/api/client";
import { usePetStore } from "@/store/usePetStore";
import { useTasksStore } from "@/store/useTasksStore";
import type { AppSettings, ProviderConfig, PetChatMessage } from "@/types/task";
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";

export type AIProvider = "openai" | "deepseek" | "claude" | "custom";

interface ActivityContext {
  page?: string;
  todayTasks?: { id: string; title: string; quadrant: string }[];
  q1Count?: number;
  recentCompleted?: { title: string; completedAt: string }[];
  locale?: string;
  userName?: string;
  /** Hours booked in the imported calendar today (#172 V2 — calendar-aware plan). */
  calendarBusyHours?: number;
}

interface AIStore {
  activeProvider: AIProvider;
  providerConfigs: Record<string, ProviderConfig>;
  configLoaded: boolean;
  messages: PetChatMessage[];
  loading: boolean;
  chatOpen: boolean;
  cloudEnabled: boolean;
  cloudUsed: number;
  cloudLimit: number;

  loadConfig: () => Promise<void>;
  /** Save config for one provider. Pass newKey only when the user entered a new key. */
  saveConfig: (opts: {
    provider: AIProvider;
    newKey?: string | null;
    model?: string | null;
    baseUrl?: string | null;
    setActive?: boolean;
  }) => Promise<void>;
  sendMessage: (text: string, ctx: ActivityContext) => Promise<void>;
  testConnection: (opts: { provider: AIProvider; key?: string; model?: string | null; baseUrl?: string | null; locale: string; userName: string }) => Promise<boolean>;
  fetchWrappedInsight: (messages: { role: "user" | "assistant"; content: string }[], context: { page: string; locale: string }) => Promise<string | null>;
  clearHistory: () => void;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai:   { hasKey: false, model: "gpt-4o-mini",               baseUrl: "https://api.openai.com/v1" },
  deepseek: { hasKey: false, model: "deepseek-chat",             baseUrl: "https://api.deepseek.com" },
  claude:   { hasKey: false, model: "claude-3-5-haiku-20241022", baseUrl: "" },
  custom:   { hasKey: false, model: "",                          baseUrl: "" },
};

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      activeProvider: "openai",
      providerConfigs: { ...DEFAULT_PROVIDER_CONFIGS },
      configLoaded: false,
      messages: [],
      loading: false,
      chatOpen: false,
      cloudEnabled: false,
      cloudUsed: 0,
      cloudLimit: 100,

      async loadConfig() {
        try {
          const s: AppSettings = await api.getSettings();
          set({
            activeProvider: s.ai_provider ?? "openai",
            providerConfigs: {
              ...DEFAULT_PROVIDER_CONFIGS,
              ...s.ai_provider_configs,
            },
            configLoaded: true,
            cloudEnabled: s.ai_cloud_enabled ?? false,
            cloudUsed: s.ai_cloud_used ?? 0,
            cloudLimit: s.ai_cloud_limit ?? 100,
          });
        } catch (e) {
          set({ configLoaded: true });
          toast.error(t("error.ai.config.load"), e instanceof Error ? e.message : String(e));
        }
      },

      async saveConfig({ provider, newKey, model, baseUrl, setActive }) {
        // Optimistically update local state
        set((s) => ({
          activeProvider: setActive ? provider : s.activeProvider,
          providerConfigs: {
            ...s.providerConfigs,
            [provider]: {
              ...s.providerConfigs[provider],
              hasKey: newKey != null && newKey.trim() !== "" ? true : (s.providerConfigs[provider]?.hasKey ?? false),
              ...(model !== undefined && { model: model ?? "" }),
              ...(baseUrl !== undefined && { baseUrl: baseUrl ?? "" }),
            },
          },
        }));
        try {
          const result = await api.patchSettings({
            ...(setActive ? { ai_provider: provider } : {}),
            ai_configs_update: {
              provider,
              ...(newKey != null ? { key: newKey } : {}),
              ...(model !== undefined ? { model } : {}),
              ...(baseUrl !== undefined ? { baseUrl } : {}),
            },
          });
          // Sync authoritative state from backend
          set({
            activeProvider: result.ai_provider ?? provider,
            providerConfigs: { ...DEFAULT_PROVIDER_CONFIGS, ...result.ai_provider_configs },
          });
        } catch (e) {
          toast.error(t("error.ai.config.save"), e instanceof Error ? e.message : String(e));
          throw e;
        }
      },

      async sendMessage(text, ctx) {
        const userMsg: PetChatMessage = { role: "user", content: text, ts: Date.now() };
        set((s) => ({ messages: [...s.messages, userMsg], loading: true }));

        const history = get().messages.slice(-20).map(({ role, content }) => ({ role, content }));

        try {
          const res = await api.petChat({ messages: history, context: ctx });
          const assistantMsg: PetChatMessage = {
            role: "assistant",
            content: res.reply,
            ts: Date.now(),
            ...(res.toolsUsed?.length ? { toolsUsed: res.toolsUsed } : {}),
          };
          set((s) => ({ messages: [...s.messages, assistantMsg], loading: false }));
          usePetStore.getState().setMood(res.mood);
          setTimeout(() => usePetStore.getState().setMood("idle"), 8000);
          if (res.toolsUsed?.length) {
            useTasksStore.getState().load();
          }
        } catch (err: unknown) {
          const detail = err instanceof Error ? err.message : String(err);
          set((s) => ({
            messages: [
              ...s.messages,
              { role: "assistant", content: `⚠ ${detail}`, ts: Date.now() },
            ],
            loading: false,
          }));
          toast.error(t("error.ai.chat"), detail);
        }
      },

      async testConnection({ provider, key, model, baseUrl, locale, userName }) {
        await get().saveConfig({ provider, newKey: key ?? null, model: model ?? null, baseUrl: baseUrl ?? null, setActive: true });
        const res = await api.petChat({
          messages: [{ role: "user", content: "ping" }],
          context: { locale, userName },
        });
        return !res.fallback;
      },

      async fetchWrappedInsight(messages, context) {
        try {
          const res = await api.petChat({ messages, context });
          return res.reply ?? null;
        } catch {
          return null;
        }
      },

      clearHistory: () => set({ messages: [] }),
      openChat: () => set({ chatOpen: true }),
      closeChat: () => set({ chatOpen: false }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
    }),
    {
      name: "lumo-ai",
      partialize: (s) => ({ messages: s.messages.slice(-50) }),
    }
  )
);
