import type { Person } from "@/types/task";

/**
 * Small circular avatar showing a person's initials over their accent color.
 *
 * Lives in its own module (rather than inside SettingsPage) so the many
 * eagerly-rendered call sites — task rows, the matrix, edit/detail modals,
 * quick-create — don't statically pull the heavy SettingsPage chunk into the
 * initial bundle, keeping route-level code splitting effective.
 */
export function PersonAvatar({
  person,
  size = 24,
}: {
  person: Pick<Person, "initials" | "color" | "name">;
  size?: number;
}) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full font-semibold select-none"
      title={person.name}
      style={{
        width: size,
        height: size,
        background: person.color,
        color: "var(--text-inverse)",
        fontSize: Math.round(size * 0.4),
        letterSpacing: "-0.02em",
      }}
    >
      {person.initials}
    </div>
  );
}
