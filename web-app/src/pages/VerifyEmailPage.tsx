import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { ApiError } from "@/api/ApiError";
import { presentError } from "@/lib/presentError";
import { Spinner } from "@/components/Spinner";
import { IconCheck } from "@/components/icons";

/**
 * /verify-email?token=… — confirm an email from the emailed link.
 *
 * The click IS the intent, so we verify automatically on mount rather than
 * making the user press another button. On success we refresh the signed-in
 * user (if any) so the "verify your email" banner clears immediately. A
 * bad/expired/used token (ApiError INVALID_VERIFICATION_TOKEN) shows an inline
 * invalid state with a path back into the app to request a fresh link.
 */
export function VerifyEmailPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [state, setState] = useState<"loading" | "success" | "invalid">(token ? "loading" : "invalid");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard StrictMode's double-invoke — a token is single-use
    (async () => {
      try {
        await verifyEmail(token);
        await refreshUser();
        setState("success");
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "INVALID_VERIFICATION_TOKEN")) {
          presentError(err, "auth.verify.err");
        }
        setState("invalid");
      }
    })();
  }, [token, verifyEmail, refreshUser]);

  return (
    <AuthShell onBack={() => navigate("/today")}>
      {state === "loading" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner size={22} />
          <div className="text-[14px] text-text-secondary">{t("auth.verify.loading")}</div>
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 44, height: 44, background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
          >
            <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
          </div>
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.verify.success.title")}</div>
          <div className="text-[12.5px] text-text-secondary">{t("auth.verify.success.body")}</div>
          <button type="button" className="btn btn-primary mt-1" onClick={() => navigate("/today")}>
            {t("auth.verify.success.cta")}
          </button>
        </div>
      )}

      {state === "invalid" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.verify.invalid.title")}</div>
          <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.verify.invalid.body")}</div>
          <button type="button" className="btn btn-secondary mt-1" onClick={() => navigate("/today")}>
            {t("auth.verify.invalid.cta")}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
