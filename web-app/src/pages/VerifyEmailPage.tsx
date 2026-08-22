import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";
import { ApiError } from "@/api/ApiError";
import { presentError } from "@/lib/presentError";
import { Spinner } from "@/components/Spinner";
import { IconCheck } from "@/components/icons";

/**
 * /verify-email — show the outcome of confirming an email from the emailed link.
 *
 * Two entry shapes:
 *   1. `?status=success|invalid` — the CURRENT flow. The emailed link points at
 *      the backend API, which verifies server-side and redirects here with the
 *      outcome. There is nothing to POST; we just render the result (and refresh
 *      the signed-in user on success so the "verify your email" banner clears).
 *   2. `?token=…` — LEGACY links that point straight at the SPA. We keep the
 *      auto-verify-on-mount POST so links already sitting in inboxes still work.
 *
 * A bad/expired/used token shows an inline invalid state with a path back into
 * the app to request a fresh link.
 */
export function VerifyEmailPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = params.get("status"); // "success" | "invalid" from the backend redirect
  const token = params.get("token") ?? ""; // legacy: SPA-side POST verification
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const isSignedIn = useAuthStore(selectIsSignedIn);
  // The link may be opened on a device with no session. Since login is
  // mandatory, send an unauthenticated visitor to /login (reachable) rather
  // than /today (which the route guard would bounce straight to /login).
  const home = isSignedIn ? "/today" : "/login";

  const initialState: "loading" | "success" | "invalid" =
    status === "success" ? "success" : status === "invalid" ? "invalid" : token ? "loading" : "invalid";
  const [state, setState] = useState(initialState);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    // Current flow: the backend already verified and redirected here. On success,
    // refresh the signed-in user so the banner clears; nothing else to do.
    if (status === "success") {
      ran.current = true;
      refreshUser();
      return;
    }
    if (status === "invalid") {
      ran.current = true;
      return;
    }
    // Legacy flow: an older link points at the SPA with the raw token — POST it.
    if (!token) return;
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
  }, [status, token, verifyEmail, refreshUser]);

  return (
    <AuthShell>
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
          <button type="button" className="btn btn-primary mt-1" onClick={() => navigate(home)}>
            {t("auth.verify.success.cta")}
          </button>
        </div>
      )}

      {state === "invalid" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-[15px] font-semibold text-text-primary">{t("auth.verify.invalid.title")}</div>
          <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.verify.invalid.body")}</div>
          <button type="button" className="btn btn-secondary mt-1" onClick={() => navigate(home)}>
            {t("auth.verify.invalid.cta")}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
