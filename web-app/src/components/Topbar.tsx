import { useNavigate } from "react-router-dom";
import { useT } from "@/i18n/useT";
import { IconSearch } from "@/components/icons";
import { useAuthStore } from "@/store/useAuthStore";
import { WinControls } from "@/components/WinControls";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenSearch?: () => void;
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI;

export function Topbar({ title, subtitle, onOpenSearch }: TopbarProps) {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div
      className="flex items-center gap-4 px-7 border-b border-border-faint"
      style={{
        height: 56,
        WebkitAppRegion: isElectron ? "drag" : undefined,
      }}
    >
      <div style={{ WebkitAppRegion: "no-drag" }}>
        <span className="text-[15px] font-semibold text-text-primary">{title}</span>
        {subtitle && <span className="ml-2.5 text-xs text-text-muted">{subtitle}</span>}
      </div>
      <div className="flex-1" />

      {/* Search — clicking opens the CommandPalette */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 bg-surface border border-border-faint rounded-lg px-3 text-xs text-text-muted hover:border-border-default transition-colors"
        style={{ height: 32, width: 240, WebkitAppRegion: "no-drag" }}
        aria-label={t("topbar.search")}
      >
        <span className="inline-flex flex-shrink-0 text-text-muted">
          <IconSearch size={14} />
        </span>
        <span className="flex-1 min-w-0 text-left text-[13px] text-text-faint truncate">
          {t("topbar.search")}
        </span>
        <span
          className="text-[10px] font-mono text-text-faint border border-border-default rounded-[3px] bg-deep flex-shrink-0"
          style={{ padding: "1px 5px" }}
        >
          ⌘K
        </span>
      </button>

      {/* Avatar */}
      <button
        onClick={() => navigate("/account")}
        title={user.name}
        className="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-semibold text-text-inverse flex-shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
        style={{
          background: "linear-gradient(135deg, var(--accent-dim), var(--accent-primary))",
          boxShadow: "0 0 0 1px var(--border-default)",
          WebkitAppRegion: "no-drag",
        }}
      >
        {user.initials}
      </button>

      <WinControls height={56} />
    </div>
  );
}
