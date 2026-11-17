import { useState, type KeyboardEvent } from "react";
import { MAX_STAGES_PER_PROJECT } from "@lumo/contracts";
import { useT } from "@/i18n/useT";
import { useProjectsStore } from "@/store/useProjectsStore";
import { StageTrack } from "@/components/StageTrack";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconArrowLeft, IconArrowRight, IconClose, IconEdit } from "@/components/icons";
import type { Project, ProjectStage, Task } from "@/types/task";

interface ProjectStagesEditorProps {
  project: Project;
  /** The project's open tasks, for the per-stage counts. */
  tasks: Task[];
}

/** Client-generated stage id, matching the contract's id grammar. */
function newStageId(): string {
  return `stg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The project's workflow stages: a track showing every stage with how many
 * tasks are in each, and an edit mode to add, rename, reorder and delete them.
 * Each change is saved on the project right away.
 */
export function ProjectStagesEditor({ project, tasks }: ProjectStagesEditorProps) {
  const t = useT();
  const update = useProjectsStore((s) => s.update);
  const stages = project.stages ?? [];
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  // Unsaved rename text per stage; a field shows its saved name when absent.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<ProjectStage | null>(null);

  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.stage_id) counts[task.stage_id] = (counts[task.stage_id] ?? 0) + 1;
  }

  function save(next: ProjectStage[]) {
    void update(project.id, { stages: next });
  }

  function add() {
    const name = newName.trim();
    if (!name) return;
    save([...stages, { id: newStageId(), name }]);
    setNewName("");
  }

  function rename(id: string) {
    const draft = drafts[id];
    setDrafts(({ [id]: _done, ...rest }) => rest);
    const current = stages.find((s) => s.id === id);
    const name = (draft ?? "").trim();
    // Blank or unchanged: drop the draft so the field shows the saved name.
    if (!current || draft === undefined || !name || name === current.name) return;
    save(stages.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function move(id: string, delta: -1 | 1) {
    const i = stages.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= stages.length) return;
    const next = [...stages];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  function remove(stage: ProjectStage) {
    if ((counts[stage.id] ?? 0) > 0) setPendingDelete(stage);
    else save(stages.filter((s) => s.id !== stage.id));
  }

  function onEnter(e: KeyboardEvent<HTMLInputElement>, fn: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  }

  const iconBtn =
    "flex items-center justify-center w-6 h-6 rounded-md text-text-faint hover:text-text-primary hover:bg-subtle transition-colors";

  if (!editing) {
    return (
      <div
        className="rounded-xl border px-3 pt-3 pb-2.5"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-faint)" }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {stages.length > 0 ? (
              <StageTrack stages={stages} currentId={null} counts={counts} />
            ) : (
              <p className="text-[12.5px] text-text-faint py-1">{t("stage.empty")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors"
            style={{ border: "1px solid var(--border-default)" }}
          >
            <IconEdit size={11} />
            {t("stage.edit")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--bg-surface)", borderColor: "var(--accent-edge)" }}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {stages.map((stage, i) => (
          <li
            key={stage.id}
            className="inline-flex items-center gap-1 rounded-lg pl-1.5 pr-1 py-1"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)" }}
          >
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-[10.5px] font-bold tabular-nums flex-shrink-0"
              style={{ color: "var(--accent-primary)", background: "var(--accent-fog)" }}
            >
              {i + 1}
            </span>
            <input
              value={drafts[stage.id] ?? stage.name}
              maxLength={30}
              onChange={(e) => setDrafts((d) => ({ ...d, [stage.id]: e.target.value }))}
              onBlur={() => rename(stage.id)}
              onKeyDown={(e) => onEnter(e, () => (e.target as HTMLInputElement).blur())}
              aria-label={`${t("stage.namePlaceholder")} ${i + 1}`}
              className="bg-transparent text-[12.5px] font-medium text-text-primary outline-none w-[88px]"
            />
            {i > 0 && (
              <button
                type="button"
                className={iconBtn}
                onClick={() => move(stage.id, -1)}
                aria-label={t("stage.moveEarlier").replace("{name}", stage.name)}
              >
                <IconArrowLeft size={11} />
              </button>
            )}
            {i < stages.length - 1 && (
              <button
                type="button"
                className={iconBtn}
                onClick={() => move(stage.id, 1)}
                aria-label={t("stage.moveLater").replace("{name}", stage.name)}
              >
                <IconArrowRight size={11} />
              </button>
            )}
            <button
              type="button"
              className={iconBtn}
              onClick={() => remove(stage)}
              aria-label={t("stage.delete").replace("{name}", stage.name)}
            >
              <IconClose size={11} />
            </button>
          </li>
        ))}
        {stages.length < MAX_STAGES_PER_PROJECT && (
          <li className="inline-flex">
            <input
              value={newName}
              maxLength={30}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => onEnter(e, add)}
              placeholder={`+ ${t("stage.namePlaceholder")}`}
              aria-label={t("stage.namePlaceholder")}
              className="inline-input text-[12.5px] w-[130px]"
            />
          </li>
        )}
      </ol>
      <div className="flex justify-end mt-2.5">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
          style={{ color: "var(--accent-primary)", background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
        >
          {t("stage.editDone")}
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t("stage.deleteTitle").replace("{name}", pendingDelete.name) : ""}
        message={pendingDelete ? t("stage.deleteMessage").replace("{n}", String(counts[pendingDelete.id] ?? 0)) : ""}
        confirmLabel={t("stage.deleteConfirm")}
        danger
        onConfirm={() => {
          if (pendingDelete) save(stages.filter((s) => s.id !== pendingDelete.id));
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
