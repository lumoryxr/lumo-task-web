import { useNavigate } from "react-router-dom";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { DogEvolutionBadge } from "@/components/DogEvolutionBadge";

/**
 * /account — signed-in user profile + plan + usage + security + danger zone.
 *
 * If the visitor isn't signed in, we surface a soft sign-in CTA instead
 * of redirecting; the local-first mode is legitimate, just not an
 * "account" in the cloud sense.
 */
export function AccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const signOut = useAuthStore((s) => s.signOut);

  if (!isSignedIn) {
    return (
      <div className="fade-in px-8 py-10 max-w-[640px] mx-auto">
        <div className="text-2xl font-semibold text-text-primary">{t("account.title")}</div>
        <div
          className="mt-6 p-6 rounded-xl border bg-surface flex items-center gap-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div
            className="flex items-center justify-center rounded-full text-text-secondary"
            style={{
              width: 48,
              height: 48,
              background: "var(--bg-deep)",
              border: "1px solid var(--border-default)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {user.initials}
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-medium text-text-primary">{t("auth.localonly")}</div>
            <div className="text-[12px] text-text-muted mt-0.5">
              {t("status.local.alone")}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/login")}>
            {t("auth.login.btn")}
            <IconArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  const stats = user.stats ?? { tasks: 0, pomodoros: 0, syncOK: false };

  async function handleSignOut() {
    await signOut();
    navigate("/today");
  }

  return (
    <div className="fade-in px-8 py-8 max-w-[760px] mx-auto">
      {/* Header card: avatar + name + plan badge */}
      <div
        className="relative p-6 rounded-xl border bg-surface overflow-hidden"
        style={{
          borderColor: "var(--border-default)",
          background:
            "linear-gradient(180deg, var(--bg-surface), var(--bg-base) 80%), radial-gradient(60% 80% at 100% 0%, var(--accent-fog), transparent 70%)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="relative flex items-center justify-center flex-shrink-0 rounded-full text-text-inverse"
            style={{
              width: 64,
              height: 64,
              fontSize: 20,
              fontWeight: 600,
              background: "linear-gradient(135deg, var(--accent-dim), var(--accent-primary))",
              boxShadow: "0 0 0 1px var(--border-default), 0 0 24px var(--accent-fog)",
            }}
          >
            {user.initials}
            <span
              className="absolute flex items-center justify-center rounded-full"
              style={{
                bottom: -2,
                right: -2,
                width: 18,
                height: 18,
                background: "var(--status-success)",
                border: "2px solid var(--bg-base)",
              }}
            >
              <IconCheck size={10} style={{ color: "var(--bg-base)", strokeWidth: 3 }} />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[18px] font-semibold text-text-primary leading-tight" style={{ letterSpacing: "-0.01em" }}>
              {user.name}
            </div>
            <div className="text-[13px] text-text-secondary mt-1">{user.email}</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full"
                style={{
                  padding: "3px 10px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: user.plan === "pro" ? "var(--accent-primary)" : "var(--text-secondary)",
                  background: user.plan === "pro" ? "var(--accent-fog)" : "var(--bg-deep)",
                  border: `1px solid ${user.plan === "pro" ? "var(--accent-edge)" : "var(--border-default)"}`,
                }}
              >
                {user.plan === "pro" ? t("account.plan.pro") : t("account.plan.free")}
              </span>
              {user.plan === "pro" && user.renewsAt && (
                <span className="text-[11px] text-text-muted">
                  {t("account.renews")} · {user.renewsAt}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dog evolution badge */}
      <div className="mt-4">
        <DogEvolutionBadge />
      </div>

      {/* Usage */}
      <Group title={t("account.usage")}>
        <div className="grid grid-cols-3 divide-x divide-border-faint">
          <Stat label={t("account.tasks")} value={String(stats.tasks)} />
          <Stat label={t("account.pomos")} value={String(stats.pomodoros)} />
          <Stat
            label={t("account.sync")}
            value={stats.syncOK ? t("account.sync.ok") : t("account.sync.off")}
            valueColor={stats.syncOK ? "var(--status-success)" : "var(--text-muted)"}
            dot={stats.syncOK}
          />
        </div>
      </Group>

      {/* Plan */}
      <Group title={t("account.plan")}>
        <Row
          label={t("account.plan")}
          helper={
            user.plan === "pro"
              ? `${t("account.renews")} · ${user.renewsAt ?? "—"}`
              : "Upgrade for unlimited sync and Lumo Pro."
          }
        >
          <span
            className="inline-flex items-center rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{
              color: "var(--text-faint)",
              background: "var(--bg-deep)",
              border: "1px solid var(--border-faint)",
              letterSpacing: "0.03em",
            }}
          >
            Coming soon
          </span>
        </Row>
      </Group>

      {/* Security */}
      <Group title={t("account.security")}>
        <Row label={t("account.changePass")}>
          <button className="btn btn-secondary" onClick={() => navigate("/account/change-password")}>
            {t("account.changePass")}
          </button>
        </Row>
        <Row label={t("auth.signout")}>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            {t("auth.signout")}
          </button>
        </Row>
      </Group>
    </div>
  );
}

function Group({
  title,
  danger,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h3
        className="text-[10px] font-semibold uppercase mb-2 pl-0.5"
        style={{ letterSpacing: "0.1em", color: danger ? "var(--status-urgent)" : "var(--text-faint)" }}
      >
        {title}
      </h3>
      <div
        className="surface-card overflow-hidden"
        style={danger ? { borderColor: "rgba(255, 107, 107, 0.25)" } : undefined}
      >
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid items-center px-5 py-4 border-t border-border-faint first:border-t-0"
      style={{ gridTemplateColumns: "220px 1fr", gap: 36 }}
    >
      <div>
        <div className="text-[13px] font-medium text-text-primary leading-snug">{label}</div>
        {helper && (
          <div className="text-[11.5px] text-text-muted mt-1 leading-relaxed max-w-[360px]">{helper}</div>
        )}
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
  dot,
}: {
  label: string;
  value: string;
  valueColor?: string;
  dot?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <div
        className="text-[10px] font-semibold uppercase text-text-faint mb-1.5"
        style={{ letterSpacing: "0.08em" }}
      >
        {label}
      </div>
      <div
        className="flex items-center gap-1.5 text-text-primary tabular-nums"
        style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: valueColor ?? "var(--text-primary)" }}
      >
        {dot && (
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "var(--status-success)",
              boxShadow: "0 0 6px var(--status-success)",
            }}
          />
        )}
        {value}
      </div>
    </div>
  );
}
