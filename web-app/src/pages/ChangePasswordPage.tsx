import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowLeft, IconCheck } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ApiError } from "@/api/ApiError";
import { presentError } from "@/lib/presentError";

/**
 * /account/change-password — form to update the user's password.
 *
 * Validates client-side (empty, mismatch, strength), then calls the real
 * backend, which verifies the current password and rotates the session. On
 * success shows an inline confirmation before redirecting back.
 */
export function ChangePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const changePassword = useAuthStore((s) => s.changePassword);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!current || !next || !confirm) {
      toast.error(t("account.changePass.err.empty"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("account.changePass.err.mismatch"));
      return;
    }
    if (next.length < 8) {
      toast.error(t("account.changePass.err.short"));
      return;
    }
    // Mirror the server's strong-password rule (≥8 + letter + number) so the
    // user gets an instant, specific message instead of a round-trip 400.
    if (!(/[A-Za-z]/.test(next) && /\d/.test(next))) {
      toast.error(t("account.changePass.err.weak"));
      return;
    }

    setLoading(true);
    try {
      // Hits the real backend: verifies the current password (400 WRONG_PASSWORD
      // if not), sets the new one, and transparently re-authenticates us.
      await changePassword(current, next);
      setSuccess(true);
      setTimeout(() => navigate("/account"), 1600);
    } catch (err) {
      // Wrong current password is the expected, actionable failure → inline,
      // localized, scoped to the current field. Anything else (network, rate
      // limit, re-auth) goes through the unified error toast.
      if (err instanceof ApiError && err.code === "WRONG_PASSWORD") {
        toast.error(t("account.changePass.err.wrong"));
      } else {
        presentError(err, "account.changePass");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in px-8 py-8 max-w-[760px] mx-auto">
      {/* Back link */}
      <button
        onClick={() => navigate("/account")}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        {t("account.title")}
      </button>

      <h1
        className="text-[22px] font-semibold text-text-primary mb-6"
        style={{ letterSpacing: "-0.01em" }}
      >
        {t("account.changePass")}
      </h1>

      <div
        className="rounded-[10px] border bg-surface overflow-hidden"
        style={{ borderColor: "var(--border-default)", maxWidth: 480 }}
      >
        {success ? (
          <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                background: "var(--accent-fog)",
                border: "1px solid var(--accent-edge)",
              }}
            >
              <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
            </div>
            <div className="text-[14px] font-medium text-text-primary">
              {t("account.changePass.success")}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col">
            <Field label={t("account.changePass.current")}>
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={current}
                className="input"
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>

            <div style={{ height: 1, background: "var(--border-faint)" }} />

            <Field label={t("account.changePass.new")}>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={next}
                className="input"
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>

            <div style={{ height: 1, background: "var(--border-faint)" }} />

            <Field label={t("account.changePass.confirm")}>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                className="input"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>

            <div
              className="flex items-center justify-end gap-2 px-5 py-4 border-t"
              style={{ borderColor: "var(--border-faint)" }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate("/account")}
                disabled={loading}
              >
                {t("settings.members.cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "…" : t("account.changePass.save")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid items-center px-5 py-4"
      style={{ gridTemplateColumns: "180px 1fr", gap: 24 }}
    >
      <label className="text-[13px] font-medium text-text-primary">{label}</label>
      <div>{children}</div>
    </div>
  );
}
