import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Person } from "@/types/task";
import { useT } from "@/i18n/useT";
import { useTasksStore } from "@/store/useTasksStore";
import { useModalA11y } from "@/hooks/useModalA11y";
import { PERSON_COLORS } from "@/lib/personColors";
import { PersonAvatar } from "@/components/PersonAvatar";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { FieldLabel } from "@/components/taskForm/FieldLabel";
import { IconCheck, IconClose, IconEdit, IconPlus, IconSearch, IconTrash, IconUsers } from "@/components/icons";

type Draft = { name: string; email: string; initials: string; color: string };

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

interface MembersPanelProps {
  people: Person[];
  onCreate: (input: Omit<Person, "id">) => Promise<Person>;
  onUpdate: (id: string, patch: Partial<Omit<Person, "id">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

/**
 * Settings → Members: the people tasks can be assigned to.
 *
 * A header (title, count, Add member), a search box once there is someone to
 * find, and the members as cards in a grid that is one column on a phone, two
 * on a tablet and three on a wide screen. Each card shows the avatar, name,
 * email and how many open tasks the person is on, with Edit and Remove. Adding
 * and editing happen in one dialog on the shared task-dialog frame, with a live
 * avatar preview; removing asks first.
 */
export function MembersPanel({ people, onCreate, onUpdate, onRemove }: MembersPanelProps) {
  const t = useT();
  const tasks = useTasksStore((s) => s.tasks);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ person: Person | null } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Person | null>(null);

  const openCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.completed) continue;
      for (const id of task.assignee_ids ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q))
    : people;

  const openAdd = () => setDialog({ person: null });

  return (
    <div>
      <header className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-text-primary">
            {t("settings.members")}
            {people.length > 0 && (
              <span className="ml-2 text-[12px] font-normal text-text-muted tabular-nums">
                {t("settings.members.count").replace("{n}", String(people.length))}
              </span>
            )}
          </h2>
          <p className="text-[12.5px] text-text-muted mt-0.5">{t("settings.members.sub")}</p>
        </div>
        {people.length > 0 && (
          <button type="button" className="btn btn-primary flex-shrink-0" onClick={openAdd}>
            <IconPlus size={14} />
            {t("settings.members.add")}
          </button>
        )}
      </header>

      {people.length === 0 ? (
        <div className="surface-card">
          <EmptyState
            variant="panel"
            icon={<IconUsers size={22} />}
            title={t("settings.members.empty.title")}
            subtitle={t("settings.members.empty")}
            cta={{ label: t("settings.members.add"), onClick: openAdd }}
          />
        </div>
      ) : (
        <>
          <div className="relative mb-3 max-w-sm">
            <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">
              <IconSearch size={14} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("settings.members.search")}
              aria-label={t("settings.members.search")}
              className="input"
              style={{ height: 36, fontSize: 13, paddingLeft: 34 }}
            />
          </div>

          {shown.length === 0 ? (
            <p className="surface-card text-[13px] text-text-muted text-center py-8">{t("settings.members.noMatch")}</p>
          ) : (
            // As many columns as fit at ≥260px each: one on a phone, more as the
            // settings column widens (sized to the container, not the window).
            <ul
              aria-label={t("settings.members")}
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }}
            >
              {shown.map((person) => {
                const open = openCounts.get(person.id) ?? 0;
                return (
                  <li key={person.id} className="surface-card group flex items-center gap-3 p-3.5 min-w-0">
                    <PersonAvatar person={person} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-text-primary truncate" title={person.name}>
                        {person.name}
                      </div>
                      <div className={`text-[12px] truncate ${person.email ? "text-text-muted" : "text-text-faint"}`}>
                        {person.email || t("settings.members.noEmail")}
                      </div>
                      <div className="mt-1 text-[11px] text-text-faint tabular-nums">
                        {t("settings.members.openTasks").replace("{n}", String(open))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <IconButton
                        label={`${t("settings.members.edit")}: ${person.name}`}
                        onClick={() => setDialog({ person })}
                      >
                        <IconEdit size={13} />
                      </IconButton>
                      <IconButton
                        label={`${t("settings.members.delete")}: ${person.name}`}
                        onClick={() => setPendingRemove(person)}
                        danger
                      >
                        <IconTrash size={13} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {dialog && (
        <MemberDialog
          person={dialog.person}
          onClose={() => setDialog(null)}
          onSave={async (draft) => {
            const input = {
              name: draft.name.trim(),
              email: draft.email.trim() || undefined,
              initials: (draft.initials.trim() || deriveInitials(draft.name)).toUpperCase(),
              color: draft.color,
            };
            if (dialog.person) await onUpdate(dialog.person.id, input);
            else await onCreate(input);
            setDialog(null);
          }}
        />
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        danger
        title={t("settings.members.delete.confirm.title")}
        message={t("settings.members.delete.confirm")}
        detail={pendingRemove?.name}
        confirmLabel={t("settings.members.delete")}
        onConfirm={() => {
          const target = pendingRemove;
          setPendingRemove(null);
          if (target) void Promise.resolve(onRemove(target.id)).catch(() => {});
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center w-8 h-8 rounded-md border border-border-faint bg-transparent text-text-muted transition-colors hover:bg-subtle ${danger ? "hover:text-status-urgent" : "hover:text-text-primary"}`}
    >
      {children}
    </button>
  );
}

/** Add or edit one member, on the same frame as the task and project dialogs. */
function MemberDialog({
  person,
  onClose,
  onSave,
}: {
  person: Person | null;
  onClose: () => void;
  onSave: (draft: Draft) => Promise<void>;
}) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [draft, setDraft] = useState<Draft>(() =>
    person
      ? { name: person.name, email: person.email ?? "", initials: person.initials, color: person.color }
      : { name: "", email: "", initials: "", color: PERSON_COLORS[0] },
  );
  // Initials follow the name until the user types their own.
  const [initialsTouched, setInitialsTouched] = useState(!!person);
  const [busy, setBusy] = useState(false);
  const title = person ? t("settings.members.editTitle") : t("settings.members.new");
  const initials = draft.initials || deriveInitials(draft.name) || "?";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !draft.name.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
    } catch {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="task-dialog-backdrop fade-in z-[200]"
      style={{ background: "rgba(8, 11, 10, 0.6)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
        className="task-dialog border rounded-[14px] bg-elevated shadow-lifted"
        style={{ borderColor: "var(--border-default)", minHeight: "auto" }}
      >
        <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
          <header className="flex items-center gap-3 px-[18px] py-4 border-b border-border-faint flex-shrink-0">
            <span data-testid="member-preview">
              <PersonAvatar person={{ name: draft.name, initials, color: draft.color }} size={40} />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
              <p className="mt-0.5 text-[11.5px] text-text-muted truncate">
                {draft.name.trim() || t("settings.members.name")}
                {draft.email.trim() ? ` · ${draft.email.trim()}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("qc.close")}
              title={t("qc.close")}
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-md text-text-muted border border-border-default bg-transparent hover:bg-subtle hover:text-text-primary hover:border-border-strong transition-colors"
            >
              <IconClose size={12} />
            </button>
          </header>

          <div className="task-dialog__body px-[18px] py-4 flex flex-col gap-4">
            <div>
              <FieldLabel>{t("settings.members.name")}</FieldLabel>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setDraft((d) => ({ ...d, name, initials: initialsTouched ? d.initials : deriveInitials(name) }));
                }}
                placeholder={t("settings.members.namePlaceholder")}
                aria-label={t("settings.members.name")}
                maxLength={80}
                className="input"
                style={{ height: 40, fontSize: 14, fontWeight: 500 }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_96px] gap-3">
              <div>
                <FieldLabel>
                  {t("settings.members.email")}
                  <span className="ml-1 normal-case tracking-normal font-normal">· {t("settings.members.optional")}</span>
                </FieldLabel>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder="name@example.com"
                  aria-label={t("settings.members.email")}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>
              <div>
                <FieldLabel>{t("settings.members.initials")}</FieldLabel>
                <input
                  value={draft.initials}
                  maxLength={2}
                  onChange={(e) => {
                    setInitialsTouched(true);
                    setDraft((d) => ({ ...d, initials: e.target.value.toUpperCase() }));
                  }}
                  placeholder={deriveInitials(draft.name) || "AB"}
                  aria-label={t("settings.members.initials")}
                  className="input text-center"
                  style={{ height: 38, fontSize: 13, fontWeight: 600 }}
                />
              </div>
            </div>

            <div>
              <FieldLabel>{t("settings.members.color")}</FieldLabel>
              <div className="flex flex-wrap items-center gap-2.5">
                {PERSON_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    aria-pressed={draft.color === c}
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    className="flex items-center justify-center w-8 h-8 rounded-full transition-transform hover:scale-105"
                    style={{
                      background: c,
                      color: "var(--text-inverse)",
                      boxShadow: draft.color === c ? "0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--text-primary)" : "none",
                    }}
                  >
                    {draft.color === c && <IconCheck size={14} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 px-[18px] py-3 border-t border-border-faint flex-shrink-0">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("settings.members.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 76 }}
              disabled={busy || !draft.name.trim()}
              aria-busy={busy}
              aria-label={t("settings.members.save")}
            >
              {busy ? <Spinner size={13} /> : t("settings.members.save")}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
