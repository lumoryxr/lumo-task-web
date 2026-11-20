import type { ProjectSection } from "@/types/task";

/** Drag payload for reordering groups — distinct from a task drag (DND_MIME). */
export const SECTION_DND_MIME = "application/x-lumo-section";

/**
 * Moves group `fromId` into `toId`'s slot (the groups between shift by one).
 * Returns null when nothing would change.
 */
export function reorderSections(sections: ProjectSection[], fromId: string, toId: string): ProjectSection[] | null {
  const from = sections.findIndex((s) => s.id === fromId);
  const to = sections.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
