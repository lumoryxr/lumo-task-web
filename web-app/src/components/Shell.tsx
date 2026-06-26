import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { QuickCreate } from "@/components/QuickCreate";
import { CommandPalette } from "@/components/CommandPalette";
import { FloatingPet } from "@/components/FloatingPet";
import { useT } from "@/i18n/useT";
import { useAppStore } from "@/store/useAppStore";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Full-viewport app frame — web / Windows desktop pattern (per Jalen's
 * feedback). The `<aside>` (sidebar) and `<main>` are siblings inside a
 * `position: fixed` stage. No window chrome, no max-width, no card —
 * the app tiles the entire viewport.
 */
const TAB_ITEMS = [
  { to: "/today",    labelKey: "nav.today",    icon: "today"    },
  { to: "/matrix",   labelKey: "nav.matrix",   icon: "matrix"   },
  { to: "/focus",    labelKey: "focus.title",  icon: "focus"    },
  { to: "/stats",    labelKey: "nav.stats",    icon: "stats"    },
  { to: "/settings", labelKey: "nav.settings", icon: "settings" },
] as const;

function TabBarIcon({ icon }: { icon: string }) {
  if (icon === "today")    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (icon === "matrix")   return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (icon === "focus")    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>;
  if (icon === "stats")    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
  if (icon === "settings") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (icon === "search")   return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
  return null;
}

export function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const t = useT();
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const density = useAppStore((s) => s.density);
  const isMobile = useIsMobile();
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Register ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const titleMap: Record<string, { title: string; sub: string }> = {
    "/today": { title: t("today.title"), sub: t("today.sub") },
    "/matrix": { title: t("matrix.title"), sub: t("matrix.sub") },
    "/focus": { title: t("focus.title"), sub: t("focus.sub") },
    "/settings": { title: t("nav.settings"), sub: "AI · Appearance · Sync" },
    "/account": { title: t("account.title"), sub: t("account.profile") },
  };
  const meta = titleMap[location.pathname] ?? titleMap["/today"];
  const isFocus = location.pathname === "/focus";

  return (
    <div className={`${reducedMotion ? "reduce-motion" : ""} density-${density}`}>
      <div className="fixed inset-0 flex bg-base">
        <div className="lumo-pulse" />
        {!isMobile && <Sidebar />}
        <main className="relative flex flex-1 flex-col min-w-0 min-h-0 bg-base">
          {!isFocus && (
            <Topbar
              title={meta.title}
              subtitle={meta.sub}
              onQuickAdd={() => setQuickOpen(true)}
              onOpenSearch={openSearch}
            />
          )}
          <div
            className="relative flex-1 min-h-0 scroll-y"
            style={{ paddingBottom: isMobile && !isFocus ? 64 : 0 }}
          >
            {outlet}
          </div>

          {quickOpen && (
            <QuickCreate
              onClose={() => setQuickOpen(false)}
              onCreated={() => {
                setQuickOpen(false);
                if (location.pathname !== "/matrix") navigate("/matrix");
              }}
            />
          )}

          <CommandPalette open={searchOpen} onClose={closeSearch} />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && !isFocus && (
        <nav
          aria-label="tab bar"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 200,
            display: "flex",
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-faint)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {TAB_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors"
                style={{ color: active ? "var(--accent-primary)" : "var(--text-faint)" }}
                aria-current={active ? "page" : undefined}
              >
                <TabBarIcon icon={item.icon} />
                <span className="text-[9px] font-medium">{t(item.labelKey)}</span>
              </button>
            );
          })}
          <button
            onClick={openSearch}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors"
            style={{ color: "var(--text-faint)" }}
          >
            <TabBarIcon icon="search" />
            <span className="text-[9px] font-medium">{t("nav.search")}</span>
          </button>
        </nav>
      )}

      <FloatingPet />
    </div>
  );
}
