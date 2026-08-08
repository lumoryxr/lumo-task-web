import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { presentError } from "@/lib/presentError";
import { Spinner } from "@/components/Spinner";
import { IconCheck } from "@/components/icons";

/**
 * /forgot-password — request a password reset link.
 *
 * The backend is deliberately enumeration-safe (it responds identically whether
 * or not the email is registered), so on success we always show the same neutral
 * "if an account exists, we've sent a link" confirmation.
 */
export function ForgotPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const forgotPassword = useAuthStore((s) => s.forgotPassword);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      presentError(err, "auth.forgot.err");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell onBack={() => navigate("/login")}>
      {sent ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
          >
            <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.forgot.sent.title")}</div>
          <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.forgot.sent.body")}</div>
          <button
            type="button"
            className="btn btn-secondary mt-2"
            onClick={() => navigate("/login")}
          >
            {t("auth.forgot.backToLogin")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-center mb-1">
            <div className="text-[16px] font-semibold text-text-primary">{t("auth.forgot.title")}</div>
            <div className="text-[12.5px] text-text-secondary mt-1 leading-relaxed">{t("auth.forgot.subtitle")}</div>
          </div>

          <label className="text-[12px] text-text-secondary">
            {t("auth.email")}
            <input
              autoFocus
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              className="input mt-1"
              style={{ width: "100%" }}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full justify-center mt-1"
            disabled={loading || !email.trim()}
            aria-busy={loading}
            aria-label={t("auth.forgot.submit")}
          >
            {loading ? <Spinner size={18} /> : t("auth.forgot.submit")}
          </button>

          <button
            type="button"
            className="text-[12px] text-text-secondary hover:text-text-primary transition-colors mt-1"
            onClick={() => navigate("/login")}
          >
            {t("auth.forgot.backToLogin")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
