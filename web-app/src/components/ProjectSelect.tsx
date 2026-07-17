import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "@/components/icons";
import { useT } from "@/i18n/useT";
import type { Project } from "@/types/task";

interface Props {
  /** Currently selected project id, or null for "no project". */
  value: string | null;
  onChange: (projectId: string | null) => void;
  projects: Project[];
  /** Accessible label — reused for the trigger's aria-label. */
  label: string;
}

/**
 * Owning-project picker (#211).
 *
 * A custom dropdown rather than a native `<select>`: the native option list
 * renders its popup with the browser's default (light) chrome and only then
 * repaints to the app's dark theme, producing a white→black flash. This
 * portal-based menu paints the correct dark colors immediately on open.
 */
export function ProjectSelect({ value, onChange, projects, label }: Props) {
  const t = useT();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const selected = value ? projects.find((p) => p.id === value) ?? null : null;

  function openMenu() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    btnRef.current?.focus();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="w-full flex items-center justify-between gap-2 text-sm rounded-md px-2.5 py-2 outline-none transition-colors"
        style={{
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        <span className="truncate">
          {selected
            ? `${selected.emoji ? `${selected.emoji} ` : ""}${selected.name}`
            : t("project.select.none")}
        </span>
        <Chevron open={open} />
      </button>
      {open && rect && (
        <ProjectSelectMenu
          anchor={rect}
          projects={projects}
          value={value}
          noneLabel={t("project.select.none")}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ProjectSelectMenu({
  anchor,
  projects,
  value,
  noneLabel,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  projects: Project[];
  value: string | null;
  noneLabel: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Native selects reposition with the anchor; a portal cannot follow a
    // scroll, so close instead of leaving a detached menu behind.
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const gap = 6;
  // Cap the visible height so long project lists scroll inside the menu.
  const rowH = 40;
  const maxH = Math.min(280, (projects.length + 1) * rowH + 8);
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openAbove = spaceBelow < maxH + gap + 16;

  const posStyle: React.CSSProperties = openAbove
    ? { bottom: window.innerHeight - anchor.top + gap }
    : { top: anchor.bottom + gap };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[48]" onClick={onClose} />
      <div
        role="listbox"
        className="fixed z-[49] rounded-xl overflow-y-auto py-1"
        style={{
          left: anchor.left,
          width: anchor.width,
          ...posStyle,
          maxHeight: maxH,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-lifted)",
          animation: "popoverIn 150ms var(--ease-enter) both",
        }}
      >
        <OptionRow
          label={noneLabel}
          selected={value === null}
          onClick={() => onPick(null)}
        />
        {projects.map((p) => (
          <OptionRow
            key={p.id}
            label={`${p.emoji ? `${p.emoji} ` : ""}${p.name}`}
            selected={value === p.id}
            onClick={() => onPick(p.id)}
          />
        ))}
      </div>
    </>,
    document.body
  );
}

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors text-left"
      style={{
        color: selected ? "var(--accent-primary)" : "var(--text-secondary)",
        background: selected ? "var(--accent-fog)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span className="truncate">{label}</span>
      {selected && <IconCheck size={13} />}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-faint)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        flexShrink: 0,
        transition: "transform 150ms var(--ease-enter)",
        transform: open ? "rotate(180deg)" : "none",
      }}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
