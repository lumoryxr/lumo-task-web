import { useState, useEffect, type FormEvent } from "react";
import { useAppStore, type Accent, type Density } from "@/store/useAppStore";
import { api } from "@/api/client";
import { usePeopleStore } from "@/store/usePeopleStore";
import { useAIStore } from "@/store/useAIStore";
import { useCalendarStore } from "@/store/useCalendarStore";
import { usePetStore } from "@/store/usePetStore";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import type { Locale, Person } from "@/types/task";
import { PERSON_COLORS } from "@/lib/personColors";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PET_SPECIES_LIST, PetSvg } from "@/components/PetSvg";
import { useNotificationStore } from "@/store/useNotificationStore";
import type { SyncStatusResponse } from "@lumo/contracts";

const ACCENT_SWATCHES: Array<{ id: Accent; hex: string; label: string }> = [
  { id: "green", hex: "#3DFFA0", label: "Lumo Green" },
  { id: "cyan", hex: "#38D4D4", label: "Calm Cyan" },
  { id: "amber", hex: "#FFAA44", label: "Warm Amber" },
  { id: "graphite", hex: "#A0ADB0", label: "Graphite" },
];

type TabId = "general" | "notifications" | "pet" | "members" | "ai" | "integrations" | "datasync";

export function SettingsPage() {
  const t = useT();
  const { accent, setAccent, density, setDensity, reducedMotion, setReducedMotion, locale, setLocale } =
    useAppStore();
  const { people, create: createPerson, update: updatePerson, remove: removePerson } = usePeopleStore();
  const { species, petName, setSpecies, setPetName, visible, toggleVisible, setPos } = usePetStore();

  const [activeTab, setActiveTab] = useState<TabId>("general");

  // Cloud sync is a desktop-only, local-first feature: the Electron build syncs
  // its local SQLite up to the cloud. The web build connects directly to its own
  // cloud DB (one deployment per customer), so "sync" doesn't apply there —
  // showing it only yields a NO_CLOUD_BASE error (#112). The Sync panel lives in
  // the "Data & Sync" tab and is gated to desktop below.
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "general",      label: t("settings.general") },
    { id: "notifications", label: t("settings.notifications") },
    { id: "pet",          label: t("settings.pet") },
    { id: "members",      label: t("settings.members") },
    { id: "ai",           label: t("ai.config.title") },
    { id: "integrations", label: t("settings.integrations") },
    { id: "datasync",     label: t("settings.dataSync") },
  ];

  return (
    <div className="fade-in flex h-full" style={{ minHeight: 0 }}>
      {/* ── Left tab nav ─────────────────────────────────────────────── */}
      <nav
        className="flex-shrink-0 flex flex-col py-6 px-3 gap-0.5 border-r overflow-y-auto"
        style={{
          width: 180,
          borderColor: "var(--border-default)",
          background: "var(--bg-deep)",
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors"
              style={{
                background: active ? "var(--accent-fog)" : "transparent",
                color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Right content panel ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-8" style={{ minWidth: 0 }}>
        <div style={{ maxWidth: 640 }}>

          {activeTab === "general" && (
            <Panel title={t("settings.general")}>
              <Row label={t("settings.accent")}>
                <div className="flex gap-2">
                  {ACCENT_SWATCHES.map((sw) => (
                    <button
                      key={sw.id}
                      onClick={() => setAccent(sw.id)}
                      title={sw.label}
                      className="flex items-center justify-center rounded-full transition-transform"
                      style={{
                        width: 28,
                        height: 28,
                        background: sw.hex,
                        outline: accent === sw.id ? "2px solid var(--text-primary)" : "1px solid var(--border-default)",
                        outlineOffset: 2,
                        transform: accent === sw.id ? "scale(1.05)" : "scale(1)",
                      }}
                    />
                  ))}
                </div>
              </Row>
              <Row label={t("settings.density")}>
                <Segmented<Density>
                  value={density}
                  options={[
                    { value: "comfortable", label: t("settings.density.comfy") },
                    { value: "compact",     label: t("settings.density.compact") },
                  ]}
                  onChange={setDensity}
                />
              </Row>
              <Row label={t("settings.reducedMotion")}>
                <Toggle value={reducedMotion} onChange={setReducedMotion} />
              </Row>
              <Row label={t("settings.language")}>
                <Segmented<Locale>
                  value={locale}
                  options={[
                    { value: "en", label: "English" },
                    { value: "zh", label: "中文" },
                  ]}
                  onChange={setLocale}
                />
              </Row>
            </Panel>
          )}

          {activeTab === "notifications" && (
            <NotificationsPanel t={t} locale={locale} />
          )}

          {activeTab === "pet" && (
            <PetPanel
              species={species}
              petName={petName}
              visible={visible}
              onSpeciesChange={setSpecies}
              onNameChange={setPetName}
              onToggleVisible={toggleVisible}
              onResetPos={() => setPos({ x: window.innerWidth - 110, y: window.innerHeight - 180 })}
              t={t}
              locale={locale}
            />
          )}

          {activeTab === "members" && (
            <MembersPanel
              people={people}
              onCreate={createPerson}
              onUpdate={updatePerson}
              onRemove={removePerson}
              t={t}
            />
          )}

          {activeTab === "ai" && (
            <AIConfigPanel t={t} locale={locale} />
          )}

          {activeTab === "integrations" && (
            <IntegrationsPanel t={t} locale={locale} />
          )}

          {activeTab === "datasync" && (
            <div className="flex flex-col gap-8">
              <StoragePanel t={t} locale={locale} />
              {isElectron && <SyncPanel t={t} locale={locale} />}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Shared layout primitives ─────────────────────────────────────── */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{title}</h2>
      <div
        className="rounded-[10px] border bg-surface overflow-hidden"
        style={{ borderColor: "var(--border-default)" }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid items-center px-5 py-4 border-t border-border-faint first:border-t-0"
      style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}
    >
      <div>
        <div className="text-[13px] font-medium text-text-primary leading-snug">{label}</div>
        {helper && (
          <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed max-w-[300px]">{helper}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ── Pet panel ────────────────────────────────────────────────────── */

function PetPanel({
  species,
  petName,
  visible,
  onSpeciesChange,
  onNameChange,
  onToggleVisible,
  onResetPos,
  t,
  locale,
}: {
  species: import("@/components/PetSvg").PetSpecies;
  petName: string;
  visible: boolean;
  onSpeciesChange: (s: import("@/components/PetSvg").PetSpecies) => void;
  onNameChange: (name: string) => void;
  onToggleVisible: () => void;
  onResetPos: () => void;
  t: (k: string) => string;
  locale: string;
}) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("settings.pet")}</h2>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        {/* Visibility + reset */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-border-faint">
          <div>
            <div className="text-[13px] font-medium text-text-primary">{t("settings.pet.show")}</div>
            <div className="text-[11px] text-text-faint mt-0.5">{t("settings.pet.show.helper")}</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onResetPos}
              className="text-[12px] px-3 py-1.5 rounded-lg transition-colors"
              style={{
                border: "1px solid var(--border-default)",
                background: "var(--bg-deep)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-deep)"; }}
            >
              {t("settings.pet.resetPos")}
            </button>
            <Toggle value={visible} onChange={onToggleVisible} />
          </div>
        </div>
        {/* Species selector */}
        <div className="px-5 py-4 border-b border-border-faint">
          <div className="text-[13px] font-medium text-text-primary mb-3">{t("settings.pet.species")}</div>
          <div className="flex gap-3 flex-wrap">
            {PET_SPECIES_LIST.map((s) => (
              <button
                key={s.value}
                onClick={() => onSpeciesChange(s.value)}
                className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all"
                style={{
                  border: species === s.value ? "2px solid var(--accent-primary)" : "1px solid var(--border-default)",
                  background: species === s.value ? "var(--accent-fog)" : "var(--bg-deep)",
                  minWidth: 72,
                }}
              >
                <PetSvg species={s.value} mood={species === s.value ? "happy" : "idle"} size={44} />
                <span className="text-[11px] text-text-secondary">
                  {locale === "zh" ? s.labelZh : s.labelEn}
                </span>
              </button>
            ))}
          </div>
        </div>
        {/* Pet name */}
        <div className="px-5 py-4">
          <label className="text-[13px] font-medium text-text-primary block mb-1.5">
            {t("settings.pet.name")}
          </label>
          <input
            type="text"
            value={petName}
            onChange={(e) => onNameChange(e.target.value.slice(0, 20))}
            placeholder={locale === "zh" ? t("settings.pet.name.placeholder.zh") : t("settings.pet.name.placeholder")}
            className="w-full text-[13px] text-text-primary bg-transparent outline-none rounded-lg px-3 py-2"
            style={{
              border: "1px solid var(--border-default)",
              background: "var(--bg-deep)",
              maxWidth: 240,
            }}
          />
          <p className="text-[11px] text-text-faint mt-1">
            {locale === "zh" ? "留空则使用默认名称" : "Leave empty to use the default name"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Members panel ────────────────────────────────────────────────── */

type PersonDraft = { name: string; email: string; initials: string; color: string };

function emptyDraft(): PersonDraft {
  return { name: "", email: "", initials: "", color: PERSON_COLORS[0] };
}

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function MembersPanel({
  people,
  onCreate,
  onUpdate,
  onRemove,
  t,
}: {
  people: Person[];
  onCreate: (input: Omit<Person, "id">) => Promise<Person>;
  onUpdate: (id: string, patch: Partial<Omit<Person, "id">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  t: (key: string) => string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PersonDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  function startEdit(person: Person) {
    setEditId(person.id);
    setEditDraft({ name: person.name, email: person.email ?? "", initials: person.initials, color: person.color });
  }

  async function saveEdit() {
    if (!editId || !editDraft.name.trim()) return;
    setBusy(true);
    try {
      await onUpdate(editId, {
        name: editDraft.name.trim(),
        email: editDraft.email.trim() || undefined,
        initials: editDraft.initials || deriveInitials(editDraft.name),
        color: editDraft.color,
      });
      setEditId(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        name: draft.name.trim(),
        email: draft.email.trim() || undefined,
        initials: draft.initials || deriveInitials(draft.name),
        color: draft.color,
      });
      setDraft(emptyDraft());
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[15px] font-semibold text-text-primary">{t("settings.members")}</h2>
        {!adding && (
          <button
            className="text-[12px] font-medium"
            style={{ color: "var(--accent-primary)" }}
            onClick={() => { setAdding(true); setDraft(emptyDraft()); }}
          >
            + {t("settings.members.add")}
          </button>
        )}
      </div>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        {people.length === 0 && !adding && (
          <div className="px-5 py-4 text-[12px] text-text-muted italic">{t("settings.members.empty")}</div>
        )}
        {people.map((person) => (
          <div key={person.id} className="border-t border-border-faint first:border-t-0">
            {editId === person.id ? (
              <PersonForm
                draft={editDraft}
                onChange={setEditDraft}
                onSave={saveEdit}
                onCancel={() => setEditId(null)}
                busy={busy}
                t={t}
              />
            ) : (
              <div className="flex items-center gap-3 px-5 py-3">
                <PersonAvatar person={person} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-text-primary">{person.name}</div>
                  {person.email && (
                    <div className="text-[11px] text-text-muted mt-0.5">{person.email}</div>
                  )}
                </div>
                <button
                  className="text-[11px] text-text-muted hover:text-text-primary transition-colors mr-3"
                  onClick={() => startEdit(person)}
                >
                  {t("settings.members.edit")}
                </button>
                <button
                  className="text-[11px] text-text-muted hover:text-status-urgent transition-colors"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try { await onRemove(person.id); } finally { setBusy(false); }
                  }}
                >
                  {t("settings.members.delete")}
                </button>
              </div>
            )}
          </div>
        ))}
        {adding && (
          <div className="border-t border-border-faint first:border-t-0">
            <PersonForm
              draft={draft}
              onChange={setDraft}
              onSave={saveNew}
              onCancel={() => setAdding(false)}
              busy={busy}
              t={t}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── AI Config panel ──────────────────────────────────────────────── */

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  claude: "Claude",
  custom: "Custom",
};
const PROVIDER_DEFAULTS: Record<string, { model: string; baseUrl: string }> = {
  openai:   { model: "gpt-4o-mini",               baseUrl: "https://api.openai.com/v1" },
  deepseek: { model: "deepseek-chat",             baseUrl: "https://api.deepseek.com" },
  claude:   { model: "claude-3-5-haiku-20241022", baseUrl: "" },
  custom:   { model: "",                          baseUrl: "" },
};

function AIConfigPanel({ t, locale }: { t: (k: string) => string; locale: string }) {
  const { activeProvider, providerConfigs, saveConfig, cloudEnabled, cloudUsed, cloudLimit } = useAIStore();
  const anyKeyConfigured = Object.values(providerConfigs).some((c) => c.hasKey);

  const [viewProvider, setViewProvider] = useState<"openai" | "deepseek" | "claude" | "custom">(activeProvider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel]   = useState(providerConfigs[activeProvider]?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(providerConfigs[activeProvider]?.baseUrl ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "ok" | "fail" | "loading">("idle");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentCfg = providerConfigs[viewProvider];
  const hasKey = currentCfg?.hasKey || apiKey.trim().length > 0;
  const isClaude = viewProvider === "claude";

  function switchProvider(p: typeof viewProvider) {
    setViewProvider(p);
    setApiKey("");
    setShowKey(false);
    setTestStatus("idle");
    setModel(providerConfigs[p]?.model ?? PROVIDER_DEFAULTS[p]?.model ?? "");
    setBaseUrl(providerConfigs[p]?.baseUrl ?? PROVIDER_DEFAULTS[p]?.baseUrl ?? "");
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await saveConfig({
        provider: viewProvider,
        ...(apiKey.trim() ? { newKey: apiKey.trim() } : {}),
        model: model.trim() || null,
        baseUrl: baseUrl.trim() || null,
        setActive: true,
      });
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // toast already fired inside saveConfig
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestStatus("loading");
    try {
      const { testConnection } = useAIStore.getState();
      const ok = await testConnection({
        provider: viewProvider,
        key: apiKey.trim() || undefined,
        model: model.trim() || null,
        baseUrl: baseUrl.trim() || null,
        locale,
        userName: "Test",
      });
      if (ok) {
        setTestStatus("ok");
      } else {
        setTestStatus("fail");
        toast.error(t("error.ai.test"), t("ai.config.test.fail"));
      }
    } catch (e) {
      setTestStatus("fail");
      toast.error(t("error.ai.test"), e instanceof Error ? e.message : String(e));
    }
  }

  const placeholderModel = PROVIDER_DEFAULTS[viewProvider]?.model ?? "";
  const placeholderUrl   = PROVIDER_DEFAULTS[viewProvider]?.baseUrl ?? "";

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("ai.config.title")}</h2>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>

        {cloudEnabled && !anyKeyConfigured && (
          <div className="px-5 py-3.5 border-b border-border-faint">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-text-primary">{t("ai.cloud.label")}</span>
              <span className="text-[11px] tabular-nums" style={{
                color: cloudUsed >= cloudLimit ? "var(--status-urgent)" : "var(--text-muted)",
              }}>
                {cloudUsed} / {cloudLimit}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-subtle)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (cloudUsed / cloudLimit) * 100)}%`,
                  background: cloudUsed >= cloudLimit ? "var(--status-urgent)" : "var(--accent-primary)",
                }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-text-muted">
              {cloudUsed >= cloudLimit ? t("ai.cloud.limit_reached") : t("ai.cloud.hint")}
            </div>
          </div>
        )}

        <div className="grid items-center px-5 py-4 border-t border-border-faint first:border-t-0"
          style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}>
          <div className="text-[13px] font-medium text-text-primary">{t("ai.config.provider")}</div>
          <div className="flex gap-1.5 flex-wrap">
            {(["openai", "deepseek", "claude", "custom"] as const).map((p) => {
              const cfg = providerConfigs[p];
              const active = viewProvider === p;
              const configured = cfg?.hasKey ?? false;
              return (
                <button
                  key={p}
                  onClick={() => switchProvider(p)}
                  className="relative flex items-center gap-1.5 px-3 h-[28px] text-[12px] rounded-md border transition-colors"
                  style={{
                    background: active ? "var(--accent-fog)" : "var(--bg-surface)",
                    borderColor: active ? "var(--accent-edge)" : "var(--border-default)",
                    color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {configured && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-primary)" }} />
                  )}
                  {PROVIDER_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid items-center px-5 py-4 border-t border-border-faint"
          style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}>
          <div className="text-[13px] font-medium text-text-primary">{t("ai.config.apiKey")}</div>
          <div className="flex items-center gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentCfg?.hasKey
                ? (locale === "zh" ? "输入新 Key 以替换" : "Enter new key to replace")
                : (isClaude ? "sk-ant-..." : "sk-...")}
              className="input flex-1"
              style={{ height: 34, fontSize: 13 }}
            />
            {apiKey && (
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-[11px] text-text-muted hover:text-text-primary transition-colors px-1.5"
              >
                {showKey ? (locale === "zh" ? "隐藏" : "Hide") : (locale === "zh" ? "显示" : "Show")}
              </button>
            )}
          </div>
        </div>

        <div className="grid items-center px-5 py-4 border-t border-border-faint"
          style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}>
          <div className="text-[13px] font-medium text-text-primary">{t("ai.config.model")}</div>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={placeholderModel}
            className="input"
            style={{ height: 34, fontSize: 13 }}
          />
        </div>

        {!isClaude && (
          <div className="grid items-center px-5 py-4 border-t border-border-faint"
            style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}>
            <div>
              <div className="text-[13px] font-medium text-text-primary">{t("ai.config.baseUrl")}</div>
              <div className="text-[11px] text-text-muted mt-0.5">{locale === "zh" ? "留空用默认地址" : "Leave blank for default"}</div>
            </div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={placeholderUrl || "https://..."}
              className="input"
              style={{ height: 34, fontSize: 13 }}
            />
          </div>
        )}

        <div className="flex items-center gap-3 px-5 py-4 border-t border-border-faint">
          <button
            onClick={handleTest}
            disabled={!hasKey || testStatus === "loading"}
            className="btn btn-secondary"
            style={{ height: 32, fontSize: 12 }}
          >
            {testStatus === "loading"
              ? (locale === "zh" ? "测试中..." : "Testing...")
              : t("ai.config.test")}
          </button>
          {testStatus === "ok" && (
            <span className="text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>
              ✓ {t("ai.config.test.ok")}
            </span>
          )}
          {testStatus === "fail" && (
            <span className="text-[12px] font-medium" style={{ color: "var(--status-urgent)" }}>
              ✗ {t("ai.config.test.fail")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ height: 32, fontSize: 12 }}
          >
            {saved ? t("ai.config.saved") : t("ai.config.save")}
          </button>
        </div>

      </div>
    </div>
  );
}

/* ── Integrations panel ───────────────────────────────────────────── */

const MS_CLIENT_ID = (import.meta as any).env?.VITE_MS_CLIENT_ID as string | undefined;

function IntegrationsPanel({ t, locale }: { t: (k: string) => string; locale: string }) {
  const { connected, userEmail, serverMode, serverEmail, loading, connect, disconnect } = useCalendarStore();
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      await connect();
    } catch {
      toast.error(t("outlook.error.connect"), "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("settings.integrations")}</h2>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        <div className="grid items-center px-5 py-4" style={{ gridTemplateColumns: "1fr auto", gap: 16 }}>
          <div>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="2" width="20" height="20" rx="3" fill="#0078D4" />
                <path d="M12 7C9.24 7 7 9.24 7 12s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8.5c-1.93 0-3.5-1.57-3.5-3.5S10.07 8.5 12 8.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" fill="white"/>
                <path d="M17 7h3v10h-3z" fill="white" opacity="0.8"/>
              </svg>
              <span className="text-[13px] font-medium text-text-primary">Microsoft Outlook</span>
              {connected && (
                <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent-fog)", color: "var(--accent-primary)" }}>
                  {serverMode ? t("outlook.serverMode") : `✓ ${t("outlook.connected")}`}
                </span>
              )}
            </div>
            {serverMode ? (
              <div className="mt-0.5 text-[11px] text-text-muted">{serverEmail ?? t("outlook.serverConfigured")}</div>
            ) : connected && userEmail ? (
              <div className="mt-0.5 text-[11px] text-text-muted">{userEmail}</div>
            ) : (
              <div className="mt-0.5 text-[11px] text-text-muted">
                {MS_CLIENT_ID ? t("outlook.hint") : t("outlook.notConfigured")}
              </div>
            )}
          </div>
          {connected ? (
            <button onClick={disconnect} className="btn btn-secondary" style={{ height: 32, fontSize: 12 }}>
              {t("outlook.disconnect")}
            </button>
          ) : serverMode ? null : (
            <button
              onClick={handleConnect}
              disabled={!MS_CLIENT_ID || busy || loading}
              className="btn btn-secondary"
              style={{ height: 32, fontSize: 12 }}
              title={!MS_CLIENT_ID ? t("outlook.notConfigured") : undefined}
            >
              {busy || loading
                ? locale === "zh" ? "连接中…" : "Connecting…"
                : t("outlook.connect")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── PersonForm ───────────────────────────────────────────────────── */

function PersonForm({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  t,
}: {
  draft: PersonDraft;
  onChange: (d: PersonDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <PersonAvatar
          person={{ name: draft.name, initials: draft.initials || deriveInitials(draft.name) || "?", color: draft.color }}
          size={36}
        />
        <div className="flex-1 grid grid-cols-2 gap-2">
          <input
            autoFocus
            placeholder={t("settings.members.name")}
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              onChange({ ...draft, name, initials: deriveInitials(name) });
            }}
            className="input"
            style={{ height: 34, fontSize: 13 }}
          />
          <input
            placeholder={t("settings.members.email") + " (optional)"}
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
            className="input"
            style={{ height: 34, fontSize: 13 }}
          />
          <input
            placeholder={t("settings.members.initials")}
            value={draft.initials}
            maxLength={2}
            onChange={(e) => onChange({ ...draft, initials: e.target.value.toUpperCase() })}
            className="input"
            style={{ height: 34, fontSize: 13 }}
          />
          <div className="flex items-center gap-1.5">
            {PERSON_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ ...draft, color: c })}
                className="rounded-full transition-transform flex-shrink-0"
                style={{
                  width: 20,
                  height: 20,
                  background: c,
                  outline: draft.color === c ? "2px solid var(--text-primary)" : "1px solid transparent",
                  outlineOffset: 2,
                  transform: draft.color === c ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy} style={{ height: 30, fontSize: 12 }}>
          {t("settings.members.cancel")}
        </button>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={busy || !draft.name.trim()}
          style={{ height: 30, fontSize: 12 }}
        >
          {t("settings.members.save")}
        </button>
      </div>
    </div>
  );
}

/* ── Storage panel ────────────────────────────────────────────────── */

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StoragePanel({ t, locale }: { t: (k: string) => string; locale: string }) {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const [info, setInfo] = useState<{ dbPath: string; dbSize: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.storageInfo()
      .then((d) => setInfo({ dbPath: d.dbPath, dbSize: d.dbSize }))
      .catch(() => setInfo(null));
  }, []);

  async function handleCopyPath() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.dbPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  async function handleChangeLocation() {
    if (!window.electronAPI) return;
    const newDir = await window.electronAPI.chooseDbFolder();
    if (!newDir) return;
    const ok = window.confirm(t("settings.storage.confirm") + "\n\n" + newDir);
    if (!ok) return;
    setMoving(true);
    try {
      const result = await window.electronAPI.moveDbTo(newDir);
      if (!result.ok) {
        toast.error(t("settings.storage.move.error"), result.error ?? t("error.unknown"));
      }
    } finally {
      setMoving(false);
    }
  }

  const revealLabel = isMac ? t("settings.storage.reveal") : t("settings.storage.reveal.win");

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("settings.storage")}</h2>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
        <div className="grid items-start px-5 py-4 border-b border-border-faint"
          style={{ gridTemplateColumns: "200px 1fr", gap: 32 }}>
          <div>
            <div className="text-[13px] font-medium text-text-primary leading-snug">
              {t("settings.storage.dbPath")}
            </div>
            <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed max-w-[200px]">
              {t("settings.storage.dbPath.helper")}
            </div>
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            {info ? (
              <div className="flex items-center gap-2 min-w-0">
                <code
                  className="flex-1 text-[11px] leading-relaxed truncate select-all"
                  style={{
                    color: "var(--text-secondary)",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border-faint)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontFamily: "monospace",
                    minWidth: 0,
                  }}
                  title={info.dbPath}
                >
                  {info.dbPath}
                </code>
                <button
                  onClick={handleCopyPath}
                  className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-md transition-colors"
                  style={{
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-deep)",
                    color: copied ? "var(--accent-primary)" : "var(--text-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? (locale === "zh" ? "已复制" : "Copied!") : (locale === "zh" ? "复制" : "Copy")}
                </button>
              </div>
            ) : (
              <span className="text-[12px] text-text-muted">{t("settings.storage.loading")}</span>
            )}
            {info && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-faint">{t("settings.storage.dbSize")}:</span>
                <span className="text-[11px] text-text-secondary tabular-nums">{fmtBytes(info.dbSize)}</span>
              </div>
            )}
            {isElectron && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleChangeLocation}
                  disabled={moving}
                  className="btn btn-secondary"
                  style={{ height: 30, fontSize: 12, opacity: moving ? 0.6 : 1 }}
                >
                  {moving ? t("settings.storage.moving") : t("settings.storage.change")}
                </button>
                <button
                  onClick={() => window.electronAPI?.showDbInFolder()}
                  className="btn btn-secondary"
                  style={{ height: 30, fontSize: 12 }}
                >
                  {revealLabel}
                </button>
              </div>
            )}
            {!isElectron && (
              <p className="text-[11px] text-text-faint leading-relaxed max-w-[340px]">
                {t("settings.storage.web.note")}
              </p>
            )}
          </div>
        </div>
        <div className="px-5 py-3 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-primary)" }} />
          <span className="text-[11.5px] text-text-muted">
            {locale === "zh"
              ? "100% 本地存储 · 数据永不离开你的设备"
              : "100% local · your data never leaves this device"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Sync panel ───────────────────────────────────────────────────── */

/**
 * Cloud-sync settings — Obsidian-like flow over the in-backend sync client.
 *
 * The panel talks to the LOCAL backend's sync endpoints (`/sync/status|enable|
 * disable|now`), which are identical in web and electron — both processes run a
 * backend that owns the cloud connection. No Turso URL/token, no relaunch.
 *
 *  - enabled === false → "Enable cloud sync" button → reveals an email/password
 *    cloud sign-in form → `api.syncEnable`.
 *  - enabled === true  → enabled state + last-synced + last-error + "Sync now"
 *    (`api.syncNow`) + "Disable" (`api.syncDisable`).
 */
function SyncPanel({ t, locale }: { t: (k: string) => string; locale: string }) {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function refresh() {
    try {
      setStatus(await api.syncStatus());
    } catch {
      /* leave previous status; transient backend hiccup */
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  /** Map a backend sync error to a concise, localised message. The api client
   *  attaches the backend error `code` and HTTP `status` to the thrown error. */
  function explainEnableError(err: unknown): string {
    const code = (err as { code?: string })?.code;
    const status = (err as { status?: number })?.status;
    if (code === "CLOUD_AUTH_FAILED" || status === 401) return t("settings.sync.error.signin");
    if (code === "NO_CLOUD_BASE") return t("settings.sync.error.notConfigured");
    if (code === "CLOUD_UNREACHABLE" || status === 502) return t("settings.sync.error.unreachable");
    return t("settings.sync.error.enable");
  }

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setFormError(null);
    try {
      const next = await api.syncEnable(email.trim(), password);
      setStatus(next);
      setShowForm(false);
      setEmail("");
      setPassword("");
    } catch (err) {
      setFormError(explainEnableError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      await api.syncNow();
      await refresh();
    } catch {
      toast.error(t("settings.sync.error.trigger"), "");
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisable() {
    if (disabling) return;
    setDisabling(true);
    try {
      setStatus(await api.syncDisable());
    } catch {
      toast.error(t("settings.sync.error.disable"), "");
    } finally {
      setDisabling(false);
    }
  }

  function fmtRelative(iso: string | null) {
    if (!iso) return t("settings.sync.never");
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return locale === "zh" ? "刚刚" : "just now";
    if (diff < 3600) return locale === "zh" ? `${Math.floor(diff / 60)} 分钟前` : `${Math.floor(diff / 60)} min ago`;
    return locale === "zh" ? `${Math.floor(diff / 3600)} 小时前` : `${Math.floor(diff / 3600)} hr ago`;
  }

  const enabled = status?.enabled ?? false;
  const badgeLabel = enabled ? t("settings.sync.onBadge") : t("settings.sync.offBadge");
  const badgeColor = enabled ? "var(--accent-primary)" : "var(--text-faint)";

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-5">{t("settings.sync")}</h2>
      <div className="rounded-[10px] border bg-surface overflow-hidden" style={{ borderColor: "var(--border-default)" }}>

        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: badgeColor }} />
            <span className="text-[12px]" style={{ color: badgeColor }}>{badgeLabel}</span>
          </div>
          {enabled && (
            <span className="text-[11px] text-text-faint">
              {t("settings.sync.lastSync")}: {fmtRelative(status?.lastSyncedAt ?? null)}
            </span>
          )}
        </div>

        {enabled ? (
          // ── Enabled: synced state + sync-now / disable controls ──────────────
          <>
            <div className="px-5 py-4 border-t border-border-faint">
              <div className="text-[13px] font-medium text-text-primary">{t("settings.sync.title")}</div>
              <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed">{t("settings.sync.enable.helper")}</div>
              {status?.lastError && (
                <div className="text-[11.5px] mt-2 leading-relaxed" style={{ color: "var(--danger, #ff6b6b)" }}>
                  {status.lastError}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border-faint flex items-center gap-2">
              <button onClick={handleSyncNow} disabled={syncing} className="btn btn-primary" style={{ height: 30, fontSize: 12, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? t("settings.sync.syncing") : t("settings.sync.syncNow")}
              </button>
              <button onClick={handleDisable} disabled={disabling} className="btn btn-secondary" style={{ height: 30, fontSize: 12, opacity: disabling ? 0.6 : 1 }}>
                {disabling ? t("settings.sync.disabling") : t("settings.sync.disable")}
              </button>
            </div>
          </>
        ) : (
          // ── Disabled: one-click enable → cloud account sign-in form ──────────
          <div className="px-5 py-4 border-t border-border-faint">
            <div className="text-[13px] font-medium text-text-primary leading-snug">{t("settings.sync.enable")}</div>
            <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed">{t("settings.sync.enable.helper")}</div>

            {!showForm ? (
              <button onClick={() => { setShowForm(true); setFormError(null); }} className="btn btn-primary mt-3" style={{ height: 30, fontSize: 12 }}>
                {t("settings.sync.enable.cta")}
              </button>
            ) : (
              <form onSubmit={handleEnable} className="mt-3 flex flex-col gap-3" style={{ maxWidth: 360 }}>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-text-secondary">{t("settings.sync.email")}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("settings.sync.email.placeholder")}
                    required
                    className="w-full text-[12px] rounded-lg px-3 py-2 outline-none focus:ring-1"
                    style={{ background: "var(--bg-deep)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-text-secondary">{t("settings.sync.password")}</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("settings.sync.password.placeholder")}
                    required
                    className="w-full text-[12px] rounded-lg px-3 py-2 outline-none focus:ring-1"
                    style={{ background: "var(--bg-deep)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
                  />
                </label>
                {formError && (
                  <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--danger, #ff6b6b)" }}>{formError}</div>
                )}
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={connecting || !email.trim() || !password} className="btn btn-primary" style={{ height: 30, fontSize: 12, opacity: connecting || !email.trim() || !password ? 0.6 : 1 }}>
                    {connecting ? t("settings.sync.connecting") : t("settings.sync.connect")}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setFormError(null); }} disabled={connecting} className="btn btn-secondary" style={{ height: 30, fontSize: 12 }}>
                    {t("settings.sync.cancel")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared primitives ────────────────────────────────────────────── */

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex p-[3px] gap-0.5 rounded-lg border bg-deep"
      style={{ borderColor: "var(--border-default)" }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="px-4 h-[30px] text-xs font-medium rounded-[5px] transition-colors whitespace-nowrap"
            style={{
              background: on ? "var(--bg-elevated)" : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: on ? "inset 0 0 0 1px var(--border-default), 0 1px 2px rgba(0,0,0,0.4)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => { if (!disabled) onChange(!value); }}
      disabled={disabled}
      className="relative rounded-full transition-colors"
      style={{
        width: 36,
        height: 20,
        background: value ? "var(--accent-primary)" : "var(--border-default)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-text-primary transition-all"
        style={{
          width: 16,
          height: 16,
          left: value ? 18 : 2,
          background: value ? "var(--text-inverse)" : "var(--text-primary)",
        }}
      />
    </button>
  );
}

/* ── Notifications panel ──────────────────────────────────────────── */

function NotificationsPanel({ t, locale: _locale }: { t: (k: string) => string; locale: string }) {
  const {
    enabled, morningTime, eveningTime, dueAlertsEnabled,
    setEnabled, setMorningTime, setEveningTime, setDueAlertsEnabled,
  } = useNotificationStore();

  const [permDenied, setPermDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleEnabled(next: boolean) {
    if (busy) return;
    setBusy(true);
    setPermDenied(false);

    try {
      if (next) {
        if (typeof Notification === "undefined") {
          setPermDenied(true);
          return;
        }
        if (Notification.permission === "denied") {
          setPermDenied(true);
          return;
        }
        if (Notification.permission === "default") {
          const result = await Notification.requestPermission();
          if (result !== "granted") {
            setPermDenied(true);
            return;
          }
        }
      }

      setEnabled(next);
      try {
        await api.patchSettings({ notifications_enabled: next });
      } catch {
        setEnabled(!next);
        toast.error(t("settings.notifications.error.save"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMorningChange(v: string) {
    const prev = morningTime;
    setMorningTime(v);
    try {
      await api.patchSettings({ morning_reminder_time: v });
    } catch {
      setMorningTime(prev);
      toast.error(t("settings.notifications.error.save"));
    }
  }

  async function handleEveningChange(v: string) {
    const prev = eveningTime;
    setEveningTime(v);
    try {
      await api.patchSettings({ evening_reminder_time: v });
    } catch {
      setEveningTime(prev);
      toast.error(t("settings.notifications.error.save"));
    }
  }

  async function handleDueAlertsChange(v: boolean) {
    const prev = dueAlertsEnabled;
    setDueAlertsEnabled(v);
    try {
      await api.patchSettings({ due_alerts_enabled: v });
    } catch {
      setDueAlertsEnabled(prev);
      toast.error(t("settings.notifications.error.save"));
    }
  }

  return (
    <Panel title={t("settings.notifications")}>
      <Row label={t("settings.notifications.enabled")} helper={t("settings.notifications.enabled.helper")}>
        <Toggle value={enabled} onChange={handleToggleEnabled} />
      </Row>
      {permDenied && (
        <div
          className="mx-5 mb-4 rounded-lg px-4 py-3 text-[12px] leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--status-urgent) 10%, transparent)",
            color: "var(--text-secondary)",
            border: "1px solid color-mix(in srgb, var(--status-urgent) 25%, transparent)",
          }}
        >
          {t("settings.notifications.permission.denied")}
        </div>
      )}
      <Row label={t("settings.notifications.morning")} helper={t("settings.notifications.morning.helper")}>
        <input
          type="time"
          value={morningTime}
          onChange={(e) => handleMorningChange(e.target.value)}
          disabled={!enabled}
          className="text-[13px] rounded-lg px-3 py-1.5 outline-none"
          style={{
            background: "var(--bg-deep)",
            border: "1px solid var(--border-default)",
            color: enabled ? "var(--text-primary)" : "var(--text-faint)",
            opacity: enabled ? 1 : 0.5,
          }}
        />
      </Row>
      <Row label={t("settings.notifications.due")} helper={t("settings.notifications.due.helper")}>
        <Toggle value={dueAlertsEnabled} onChange={handleDueAlertsChange} disabled={!enabled} />
      </Row>
      <Row label={t("settings.notifications.evening")} helper={t("settings.notifications.evening.helper")}>
        <input
          type="time"
          value={eveningTime}
          onChange={(e) => handleEveningChange(e.target.value)}
          disabled={!enabled}
          className="text-[13px] rounded-lg px-3 py-1.5 outline-none"
          style={{
            background: "var(--bg-deep)",
            border: "1px solid var(--border-default)",
            color: enabled ? "var(--text-primary)" : "var(--text-faint)",
            opacity: enabled ? 1 : 0.5,
          }}
        />
      </Row>
    </Panel>
  );
}
