import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { DogEvolutionBadge } from "@/components/DogEvolutionBadge";
import { useModalA11y } from "@/hooks/useModalA11y";
import { toast } from "@/store/useToastStore";
import { presentError } from "@/lib/presentError";
import { ApiError } from "@/api/ApiError";
import { RecoveryCodeCard } from "@/components/RecoveryCodeCard";
import { DONATE_URL } from "@/config/app";

/** Serialize `data` and trigger a client-side file download. */
function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
  const exportData = useAuthStore((s) => s.exportData);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const bundle = await exportData();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`lumo-export-${stamp}.json`, bundle);
      toast.success(t("account.export.success"));
    } catch (e) {
      presentError(e, "account.export.err");
    } finally {
      setExporting(false);
    }
  }

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
            <div className="text-[13px] text-text-secondary mt-1">
              {user.email ? user.email : `@${user.username ?? ""}`}
            </div>
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

      {/* Support — Lumo is free; this is a voluntary donation link, not a paid tier. */}
      <Group title={t("account.support")}>
        <Row label={t("account.support")} helper={t("account.support.desc")}>
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{
              color: "var(--accent-primary)",
              background: "var(--accent-fog)",
              border: "1px solid var(--accent-edge)",
              letterSpacing: "0.02em",
            }}
          >
            {t("account.support.cta")}
            <IconArrowRight size={12} style={{ transform: "rotate(-45deg)" }} />
          </a>
        </Row>
      </Group>

      {/* Security */}
      <Group title={t("account.security")}>
        <Row label={t("account.email.label")} helper={t("account.email.desc")}>
          <div className="flex items-center gap-2.5">
            {user.email ? (
              <>
                <span className="text-[12.5px] text-text-secondary">{user.email}</span>
                <EmailStatePill verified={user.emailVerified !== false} />
              </>
            ) : (
              <span className="text-[12px] text-text-muted">{t("account.email.none")}</span>
            )}
            <button className="btn btn-secondary" onClick={() => setEmailOpen(true)}>
              {user.email ? t("account.email.change") : t("account.email.bind")}
            </button>
          </div>
        </Row>
        <Row label={t("account.recovery")} helper={t("account.recovery.desc")}>
          <RegenerateRecoveryButton onCode={setRecoveryCode} />
        </Row>
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

      {/* Data & privacy */}
      <Group title={t("account.data")}>
        <Row label={t("account.export")} helper={t("account.export.desc")}>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={exporting}
            aria-busy={exporting}
          >
            {exporting ? t("account.export.busy") : t("account.export.btn")}
          </button>
        </Row>
      </Group>

      {/* Danger zone */}
      <Group title={t("account.danger")} danger>
        <Row label={t("account.delete")} helper={t("account.delete.desc")}>
          <button
            className="btn btn-secondary"
            style={{ color: "var(--status-urgent)", borderColor: "rgba(255,107,107,0.4)" }}
            onClick={() => setDeleteOpen(true)}
          >
            {t("account.delete.btn")}
          </button>
        </Row>
      </Group>

      <DeleteAccountDialog
        open={deleteOpen}
        expectedValue={user.email || user.username || ""}
        onCancel={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          toast.success(t("account.delete.success"));
          navigate("/today");
        }}
      />

      <EmailDialog
        open={emailOpen}
        hasEmail={Boolean(user.email)}
        onCancel={() => setEmailOpen(false)}
        onBound={() => {
          setEmailOpen(false);
          toast.success(t("account.email.success"));
        }}
      />

      <RecoveryModal code={recoveryCode} onClose={() => setRecoveryCode(null)} />
    </div>
  );
}

/** Small verified/unverified pill for a bound email. */
function EmailStatePill({ verified }: { verified: boolean }) {
  const t = useT();
  return (
    <span
      className="inline-flex items-center rounded-full"
      style={{
        padding: "2px 8px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: verified ? "var(--status-success)" : "var(--text-muted)",
        background: "var(--bg-deep)",
        border: "1px solid var(--border-faint)",
      }}
    >
      {verified ? t("account.email.verified") : t("account.email.unverified")}
    </span>
  );
}

/** Regenerate button — surfaces the new one-time code to the parent for display. */
function RegenerateRecoveryButton({ onCode }: { onCode: (code: string) => void }) {
  const t = useT();
  const regenerate = useAuthStore((s) => s.regenerateRecoveryCode);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const code = await regenerate();
      onCode(code);
    } catch (e) {
      presentError(e, "account.recovery.err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-secondary" onClick={run} disabled={busy} aria-busy={busy}>
      {busy ? t("account.recovery.busy") : t("account.recovery.regen")}
    </button>
  );
}

/**
 * Irreversible account-deletion confirmation. Requires the user to type their
 * own email before the destructive action unlocks — a deliberate friction gate
 * so a misclick can never erase an account.
 */
function DeleteAccountDialog({
  open,
  expectedValue,
  onCancel,
  onDeleted,
}: {
  open: boolean;
  /** The email (if bound) or username the user must retype to confirm erasure. */
  expectedValue: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (busy) return;
    setConfirmText("");
    onCancel();
  };
  const dialogRef = useModalA11y<HTMLDivElement>(close, open);

  if (!open) return null;

  const matches = confirmText.trim().toLowerCase() === expectedValue.trim().toLowerCase();

  async function handleDelete() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      await deleteAccount();
      setConfirmText("");
      onDeleted();
    } catch (e) {
      presentError(e, "account.delete.err");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={t("account.delete.modal.title")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 420, maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--status-urgent)" }}>
            {t("account.delete.modal.title")}
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {t("account.delete.modal.body")}
          </p>
          <label
            htmlFor="delete-confirm-email"
            style={{ display: "block", margin: "16px 0 6px", fontSize: 12, color: "var(--text-muted)" }}
          >
            {t("account.delete.modal.prompt")}
          </label>
          <input
            id="delete-confirm-email"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expectedValue}
            disabled={busy}
            className="input"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 20px 20px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={close}
            disabled={busy}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || busy}
            aria-busy={busy}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-md)",
              border: "1px solid rgba(255,107,107,0.4)",
              background: matches && !busy ? "rgba(255,107,107,0.12)" : "var(--bg-deep)",
              color: matches && !busy ? "var(--status-urgent)" : "var(--text-faint)",
              fontSize: 13, fontWeight: 600,
              cursor: matches && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? t("account.delete.modal.busy") : t("account.delete.modal.cta")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Bind (or change) the account email. Sets it unverified and sends a
 * verification link; usage is never blocked. Surfaces EMAIL_TAKEN inline.
 */
function EmailDialog({
  open,
  hasEmail,
  onCancel,
  onBound,
}: {
  open: boolean;
  hasEmail: boolean;
  onCancel: () => void;
  onBound: () => void;
}) {
  const t = useT();
  const bindEmail = useAuthStore((s) => s.bindEmail);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setEmail("");
    setError(null);
    onCancel();
  };
  const dialogRef = useModalA11y<HTMLFormElement>(close, open);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await bindEmail(email.trim());
      setEmail("");
      onBound();
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        setError(t("account.email.taken"));
      } else if (err instanceof ApiError && err.fields?.length) {
        setError(err.fields[0].message);
      } else {
        presentError(err, "account.email.err");
      }
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={hasEmail ? t("account.email.modal.changeTitle") : t("account.email.modal.bindTitle")}
        ref={dialogRef}
        tabIndex={-1}
        onSubmit={submit}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 420, maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            {hasEmail ? t("account.email.modal.changeTitle") : t("account.email.modal.bindTitle")}
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
            {t("account.email.modal.body")}
          </p>
          <label
            htmlFor="bind-email-input"
            style={{ display: "block", margin: "16px 0 6px", fontSize: 12, color: "var(--text-muted)" }}
          >
            {t("account.email.modal.prompt")}
          </label>
          <input
            id="bind-email-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            className="input"
            style={{ width: "100%" }}
          />
          {error && (
            <span role="alert" className="block text-[11px] mt-2" style={{ color: "var(--status-urgent)" }}>
              {error}
            </span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 20px 20px" }}>
          <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!email.trim() || busy}
            aria-busy={busy}
          >
            {busy ? t("account.email.modal.busy") : t("account.email.modal.submit")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Shows a freshly-regenerated recovery code once, in a dismissable modal. */
function RecoveryModal({ code, onClose }: { code: string | null; onClose: () => void }) {
  const t = useT();
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, code != null);

  if (code == null) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("account.recovery.modal.title")}
        ref={dialogRef}
        tabIndex={-1}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lifted)",
          width: 420, maxWidth: "calc(100vw - 32px)",
          padding: 20,
        }}
      >
        <RecoveryCodeCard code={code} />
        <button type="button" className="btn btn-primary btn-lg w-full justify-center mt-4" onClick={onClose}>
          {t("auth.register.recovery.saved")}
        </button>
      </div>
    </div>,
    document.body,
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
