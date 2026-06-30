import { NavLink, useNavigate } from "react-router-dom";
import { IconClock, IconCountdown, IconHabit, IconMatrix, IconProject, IconSettings, IconStats, IconToday, LumoGlyph } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { useTasksStore } from "@/store/useTasksStore";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";

/**
 * Left navigation rail. Routes use `react-router-dom`'s NavLink so the
 * active item is detected via the URL.
 *
 * Footer:
 * - Local user  → soft "Sign in" CTA with local-mode note
 * - Signed in   → avatar chip + name + plan badge, click → /account
 */
export function Sidebar() {
  const t = useT();
  const navigate = useNavigate();
  const tasks = useTasksStore((s) => s.tasks);
  const todayCount = useTasksStore((s) => s.todayTasks().length);
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore(selectIsSignedIn);

  const items = [
    { to: "/today",     label: t("nav.today"),     icon: <IconToday />,     badge: todayCount },
    { to: "/matrix",    label: t("nav.matrix"),    icon: <IconMatrix />,    badge: tasks.length },
    { to: "/focus",     label: t("nav.focus"),     icon: <IconClock /> },
    { to: "/habits",    label: t("nav.habits"),    icon: <IconHabit /> },
    { to: "/projects",  label: t("nav.projects"),  icon: <IconProject /> },
    { to: "/stats",     label: t("nav.stats"),     icon: <IconStats /> },
    { to: "/countdown", label: t("nav.countdown"), icon: <IconCountdown /> },
    { to: "/settings",  label: t("nav.settings"),  icon: <IconSettings /> },
  ];

  return (
    <aside
      className="flex flex-col flex-shrink-0 py-5 pb-4 bg-deep border-r border-border-faint"
      style={{ width: 220 }}
    >
      <div className="flex items-center gap-2.5 px-[18px] pb-6 text-[15px] font-semibold tracking-tight text-text-primary">
        <LumoGlyph />
        <span>
          {t("brand.name")}
          <span className="ml-1 font-normal text-text-faint">Task</span>
        </span>
      </div>

      <div className="px-[18px] pt-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-faint">
        {t("nav.section.workspace")}
      </div>

      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}
        >
          {it.icon}
          <span>{it.label}</span>
          {it.badge != null && <span className="badge">{it.badge}</span>}
        </NavLink>
      ))}

      {/* Account footer */}
      <div className="mt-auto border-t border-border-faint px-[14px] pt-3 pb-1">
        {isSignedIn ? (
          /* Signed-in card */
          <button
            onClick={() => navigate("/account")}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors hover:bg-surface group"
          >
            {/* Avatar */}
            <div
              className="flex items-center justify-center flex-shrink-0 rounded-full text-[11px] font-semibold text-text-inverse"
              style={{
                width: 28,
                height: 28,
                background: "linear-gradient(135deg, var(--accent-dim), var(--accent-primary))",
              }}
            >
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-text-primary truncate leading-tight">
                {user.name}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="text-[9px] font-semibold uppercase rounded px-1 py-px"
                  style={{
                    letterSpacing: "0.06em",
                    color: user.plan === "pro" ? "var(--accent-primary)" : "var(--text-muted)",
                    background: user.plan === "pro" ? "var(--accent-fog)" : "var(--bg-elevated)",
                    border: `1px solid ${user.plan === "pro" ? "var(--accent-edge)" : "var(--border-faint)"}`,
                  }}
                >
                  {user.plan === "pro" ? t("account.plan.pro") : t("account.plan.free")}
                </span>
              </div>
            </div>
            {/* Sync status dot */}
            {user.stats?.syncOK && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: "var(--status-success)",
                  boxShadow: "0 0 6px var(--status-success)",
                }}
              />
            )}
          </button>
        ) : (
          /* Local-mode footer */
          <div className="flex flex-col gap-1.5 px-1">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "var(--status-success)", boxShadow: "0 0 8px var(--status-success)" }}
              />
              <span>{t("status.local")}</span>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="mt-1 w-full text-left text-[11px] text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
            >
              <span
                className="inline-block rounded-sm text-[9px] font-semibold uppercase px-1.5 py-0.5"
                style={{
                  background: "var(--accent-fog)",
                  border: "1px solid var(--accent-edge)",
                  color: "var(--accent-primary)",
                  letterSpacing: "0.06em",
                }}
              >
                {t("auth.login.btn")}
              </span>
              <span>{t("status.local.alone")}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
