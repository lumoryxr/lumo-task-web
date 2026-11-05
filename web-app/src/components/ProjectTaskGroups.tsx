import { useState, type DragEvent, type KeyboardEvent } from "react";
import { MAX_SECTIONS_PER_PROJECT } from "@lumo/contracts";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { useTasksStore } from "@/store/useTasksStore";
import { TaskRow } from "@/components/TaskRow";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconChevronRight, IconMore, IconPlus } from "@/components/icons";
import { DND_MIME, makeDragProps } from "@/lib/taskDnd";
import type { Project, ProjectSection, Task } from "@/types/task";

interface ProjectTaskGroupsProps {
  project: Project;
  /** The project's open tasks. */
  tasks: Task[];
  /** Open the create dialog, pre-filed into a group (null = ungrouped). */
  onAddTask: (sectionId: string | null) => void;
}

/** Client-generated group id, matching the contract's id grammar. */
function newSectionId(): string {
  return `sec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The project's task list, split into the user's custom groups ("sections").
 *
 * Groups are created, renamed, reordered and deleted here (persisted on the
 * project), and tasks move between them by drag-and-drop (persisted on the
 * task). A task whose group no longer exists falls back to "Ungrouped". With no
 * groups at all it renders as a plain list, so projects that don't use groups
 * look exactly as before.
 */
export function ProjectTaskGroups({ project, tasks, onAddTask }: ProjectTaskGroupsProps) {
  const t = useT();
  const updateProject = useProjectsStore((s) => s.update);
  const updateTask = useTasksStore((s) => s.update);
  const sections = project.sections ?? [];

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectSection | null>(null);

  const known = new Set(sections.map((s) => s.id));
  const groupOf = (task: Task) => (task.section_id && known.has(task.section_id) ? task.section_id : null);
  const ungrouped = tasks.filter((tk) => groupOf(tk) === null);

  function saveSections(next: ProjectSection[]) {
    void updateProject(project.id, { sections: next });
  }

  function commitNew() {
    const name = draft.trim();
    if (!name) return;
    saveSections([...sections, { id: newSectionId(), name }]);
    setDraft("");
    setAdding(false);
  }

  function commitRename(id: string) {
    const name = draft.trim();
    setRenaming(null);
    if (!name || name === sections.find((s) => s.id === id)?.name) return;
    saveSections(sections.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function move(id: string, delta: -1 | 1) {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    saveSections(next);
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveTaskTo(taskId: string, sectionId: string | null) {
    const task = tasks.find((tk) => tk.id === taskId);
    if (!task || groupOf(task) === sectionId) return;
    void updateTask(taskId, { section_id: sectionId });
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>, commit: () => void, cancel: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  const taskList = (list: Task[]) => (
    <div className="flex flex-col gap-1.5">
      {list.map((task) => (
        <div key={task.id} {...makeDragProps(task.id)} className="cursor-grab active:cursor-grabbing">
          <TaskRow task={task} compact />
        </div>
      ))}
    </div>
  );

  const newGroupControl =
    sections.length >= MAX_SECTIONS_PER_PROJECT ? null : adding ? (
      <input
        autoFocus
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => onNameKey(e, commitNew, () => { setAdding(false); setDraft(""); })}
        onBlur={() => { if (!draft.trim()) setAdding(false); }}
        placeholder={t("project.groups.namePlaceholder")}
        aria-label={t("project.groups.namePlaceholder")}
        className="inline-input text-sm w-full max-w-[260px]"
      />
    ) : (
      <button
        type="button"
        onClick={() => { setDraft(""); setAdding(true); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-text-muted hover:text-text-primary transition-colors"
        style={{ border: "1px dashed var(--border-default)" }}
      >
        <IconPlus size={12} />
        {t("project.groups.add")}
      </button>
    );

  // No groups yet: the plain list, plus a way to start grouping.
  if (sections.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        {tasks.length > 0 && taskList(tasks)}
        <div>{newGroupControl}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ungrouped.length > 0 && (
        <TaskGroup
          id={null}
          name={t("project.groups.ungrouped")}
          count={ungrouped.length}
          collapsed={collapsed.has("__ungrouped")}
          onToggle={() => toggle("__ungrouped")}
          onDropTask={(id) => moveTaskTo(id, null)}
          muted
        >
          {taskList(ungrouped)}
        </TaskGroup>
      )}

      {sections.map((section, index) => {
        const list = tasks.filter((tk) => groupOf(tk) === section.id);
        const isRenaming = renaming === section.id;
        return (
          <TaskGroup
            key={section.id}
            id={section.id}
            name={section.name}
            count={list.length}
            collapsed={collapsed.has(section.id)}
            onToggle={() => toggle(section.id)}
            onDropTask={(id) => moveTaskTo(id, section.id)}
            titleSlot={
              isRenaming ? (
                <input
                  autoFocus
                  value={draft}
                  maxLength={60}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => onNameKey(e, () => commitRename(section.id), () => setRenaming(null))}
                  onBlur={() => commitRename(section.id)}
                  aria-label={t("project.groups.namePlaceholder")}
                  className="inline-input text-sm flex-1 min-w-0"
                />
              ) : undefined
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => onAddTask(section.id)}
                  aria-label={t("project.groups.addTask").replace("{name}", section.name)}
                  title={t("project.groups.addTask").replace("{name}", section.name)}
                  className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:text-text-primary hover:bg-subtle transition-colors"
                >
                  <IconPlus size={13} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === section.id ? null : section.id)}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === section.id}
                    aria-label={t("project.groups.actions").replace("{name}", section.name)}
                    className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:text-text-primary hover:bg-subtle transition-colors"
                  >
                    <IconMore size={13} />
                  </button>
                  {menuFor === section.id && (
                    <>
                      <div className="fixed inset-0 z-[60]" aria-hidden="true" onClick={() => setMenuFor(null)} />
                      <div
                        role="menu"
                        onKeyDown={(e) => { if (e.key === "Escape") setMenuFor(null); }}
                        className="absolute right-0 top-full mt-1 z-[61] min-w-[140px] rounded-lg border py-1"
                        style={{ background: "var(--bg-elevated)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lifted)" }}
                      >
                        <MenuItem
                          label={t("project.groups.rename")}
                          onSelect={() => { setMenuFor(null); setDraft(section.name); setRenaming(section.id); }}
                        />
                        {index > 0 && (
                          <MenuItem label={t("project.groups.moveUp")} onSelect={() => { setMenuFor(null); move(section.id, -1); }} />
                        )}
                        {index < sections.length - 1 && (
                          <MenuItem label={t("project.groups.moveDown")} onSelect={() => { setMenuFor(null); move(section.id, 1); }} />
                        )}
                        <MenuItem
                          label={t("project.groups.delete")}
                          danger
                          onSelect={() => { setMenuFor(null); setPendingDelete(section); }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            }
          >
            {list.length > 0 ? (
              taskList(list)
            ) : (
              <p className="text-[12px] text-text-faint px-1 py-1.5">{t("project.groups.empty")}</p>
            )}
          </TaskGroup>
        );
      })}

      <div>{newGroupControl}</div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t("project.groups.deleteTitle").replace("{name}", pendingDelete.name) : ""}
        message={t("project.groups.deleteMessage")}
        confirmLabel={t("project.groups.deleteConfirm")}
        danger
        onConfirm={() => {
          if (pendingDelete) saveSections(sections.filter((s) => s.id !== pendingDelete.id));
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

interface TaskGroupProps {
  id: string | null;
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onDropTask: (taskId: string) => void;
  /** Replaces the name (e.g. an inline rename input). */
  titleSlot?: React.ReactNode;
  actions?: React.ReactNode;
  /** The Ungrouped bucket reads quieter than a named group. */
  muted?: boolean;
  children: React.ReactNode;
}

/** One collapsible group that also accepts dropped tasks. */
function TaskGroup({ name, count, collapsed, onToggle, onDropTask, titleSlot, actions, muted, children }: TaskGroupProps) {
  const [over, setOver] = useState(false);

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DND_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!over) setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const id = e.dataTransfer.getData(DND_MIME);
      if (id) onDropTask(id);
    },
  };

  return (
    <section
      aria-label={name}
      {...dropHandlers}
      className="rounded-xl transition-colors"
      style={{
        padding: "6px 8px 8px",
        background: over ? "var(--accent-fog)" : "transparent",
        outline: over ? "1px dashed var(--accent-edge)" : "1px solid transparent",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1 min-h-[26px]">
        {titleSlot ?? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 hover:bg-subtle transition-colors"
          >
            <span
              aria-hidden="true"
              className="flex-shrink-0 text-text-faint transition-transform"
              style={{ transform: collapsed ? "none" : "rotate(90deg)" }}
            >
              <IconChevronRight size={13} strokeWidth={2} />
            </span>
            <span
              className="truncate text-[13px] font-semibold"
              style={{ color: muted ? "var(--text-muted)" : "var(--text-primary)" }}
            >
              {name}
            </span>
          </button>
        )}
        <span
          className="flex-shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums leading-[18px]"
          style={{ color: "var(--text-muted)", background: "var(--bg-subtle)" }}
        >
          {count}
        </span>
        <div className="flex-1" />
        {actions && <div className="flex items-center gap-0.5 flex-shrink-0">{actions}</div>}
      </div>
      {!collapsed && children}
    </section>
  );
}

function MenuItem({ label, onSelect, danger }: { label: string; onSelect: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-subtle transition-colors"
      style={{ color: danger ? "var(--status-urgent)" : "var(--text-secondary)" }}
    >
      {label}
    </button>
  );
}
