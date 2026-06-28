import type React from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconCopy, IconEdit, IconTrash } from "@/components/icons";
import { useT } from "@/i18n/useT";

interface Props {
  anchor: DOMRect;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function TaskMoreMenu({ anchor, onClose, onEdit, onDuplicate, onDelete }: Props) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const popoverH = 132;
  const gap = 6;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openAbove = spaceBelow < popoverH + gap + 16;

  const posStyle: React.CSSProperties = openAbove
    ? { bottom: window.innerHeight - anchor.top + gap }
    : { top: anchor.bottom + gap };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[48]" onClick={onClose} />
      <div
        className="fixed z-[49] rounded-xl overflow-hidden"
        style={{
          right: Math.max(window.innerWidth - anchor.right, 8),
          ...posStyle,
          minWidth: 152,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-lifted)",
          animation: "popoverIn 150ms var(--ease-enter) both",
        }}
      >
        <MenuBtn
          icon={<IconEdit size={13} />}
          label={t("popover.edit")}
          onClick={() => { onClose(); onEdit(); }}
        />
        <MenuBtn
          icon={<IconCopy size={13} />}
          label={t("popover.duplicate")}
          onClick={() => { onClose(); onDuplicate(); }}
        />
        <div style={{ height: 1, background: "var(--border-faint)" }} />
        <MenuBtn
          icon={<IconTrash size={13} />}
          label={t("popover.delete")}
          danger
          onClick={() => { onClose(); onDelete(); }}
        />
      </div>
    </>,
    document.body
  );
}

function MenuBtn({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors text-left"
      style={{ color: danger ? "#e05252" : "var(--text-secondary)", background: "transparent" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? "rgba(224, 82, 82, 0.08)"
          : "var(--bg-subtle)";
      }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {icon}
      {label}
    </button>
  );
}
