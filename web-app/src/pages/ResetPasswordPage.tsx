import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ApiError } from "@/api/ApiError";
import { presentError } from "@/lib/presentError";
import { Spinner } from "@/components/Spinner";
import { IconCheck } from "@/components/icons";

/**
 * /reset-password?token=… — set a new password from an emailed reset link.
 *
 * Validates the new password client-side (mirroring the server's strong-password
 * rule) for instant feedback, then calls the backend. A bad/expired/used token
 * comes back as ApiError INVALID_RESET_TOKEN, which we surface inline with a path
 * back to requesting a fresh link rather than a generic toast.
 */
export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!next || !confirm) {
      toast.error(t("auth.reset.err.empty"));
      return;
    }
    if (next !== confirm) {
      toast.error(t("auth.reset.err.mismatch"));
      return;
    }
    if (next.length < 8) {
      toast.error(t("auth.reset.err.short"));
      return;
    }
    if (!(/[A-Za-z]/.test(next) && /\d/.test(next))) {
      toast.error(t("auth.reset.err.weak"));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, next);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 1600);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_RESET_TOKEN") {
        setInvalidToken(true);
      } else {
        presentError(err, "auth.reset.err");
      }
    } finally {
      setLoading(false);
    }
  }

  const showInvalid = !token || invalidToken;

  return (
    <AuthShell onBack={() => navigate("/login")}>
      {success ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
          >
            <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.reset.success.title")}</div>
          <div className="text-[12.5px] text-text-secondary">{t("auth.reset.success.body")}</div>
        </div>
      ) : showInvalid ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.reset.invalid.title")}</div>
          <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.reset.invalid.body")}</div>
          <button type="button" className="btn btn-primary mt-1" onClick={() => navigate("/forgot-password")}>
            {t("auth.reset.invalid.cta")}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-center mb-1">
            <div className="text-[16px] font-semibold text-text-primary">{t("auth.reset.title")}</div>
            <div className="text-[12.5px] text-text-secondary mt-1">{t("auth.reset.subtitle")}</div>
          </div>

          <label className="text-[12px] text-text-secondary">
            {t("auth.reset.new")}
            <input
              autoFocus
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={next}
              className="input mt-1"
              style={{ width: "100%" }}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>

          <label className="text-[12px] text-text-secondary">
            {t("auth.reset.confirm")}
            <input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              className="input mt-1"
              style={{ width: "100%" }}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full justify-center mt-1"
            disabled={loading}
            aria-busy={loading}
            aria-label={t("auth.reset.submit")}
          >
            {loading ? <Spinner size={18} /> : t("auth.reset.submit")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
