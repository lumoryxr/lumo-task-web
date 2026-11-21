/**
 * What the top bar says for a route: the section you are in, picked by the
 * first path segment — so a project's own page (/projects/:id) still reads
 * "Projects" and no page falls back to a misleading "Today".
 */
export function topbarTitle(
  pathname: string,
  t: (key: string) => string,
): { title: string; sub?: string } {
  const titles: Record<string, { title: string; sub?: string }> = {
    today: { title: t("today.title"), sub: t("today.sub") },
    matrix: { title: t("matrix.title"), sub: t("matrix.sub") },
    focus: { title: t("focus.title"), sub: t("focus.sub") },
    settings: { title: t("nav.settings"), sub: t("settings.sub") },
    account: { title: t("account.title"), sub: t("account.profile") },
    projects: { title: t("nav.projects") },
    habits: { title: t("nav.habits") },
    stats: { title: t("nav.stats") },
    countdown: { title: t("nav.countdown") },
  };
  return titles[pathname.split("/")[1] ?? ""] ?? titles.today;
}
