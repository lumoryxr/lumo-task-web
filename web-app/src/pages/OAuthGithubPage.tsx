import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { presentError } from "@/lib/presentError";
import { Spinner } from "@/components/Spinner";

/**
 * /oauth/github?code=… — the SPA landing route for GitHub OAuth.
 *
 * The backend callback hands the browser a ONE-TIME code here (never a token in
 * the URL). We exchange it for a session on mount — the redirect IS the intent,
 * so there is no button — then route into the app. Any failure (missing/used
 * code, network) drops back to /login with a toast. The exchange is single-use,
 * so a `useRef` guards against StrictMode's double-invoke replaying it.
 */
export function OAuthGithubPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get("code") ?? "";
  const completeGithubLogin = useAuthStore((s) => s.completeGithubLogin);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true; // the handoff code is single-use — never replay it
    (async () => {
      if (!code) {
        navigate("/login", { replace: true });
        return;
      }
      try {
        await completeGithubLogin(code);
        navigate("/today", { replace: true });
      } catch (err) {
        presentError(err, "auth.oauth.err");
        navigate("/login", { replace: true });
      }
    })();
  }, [code, completeGithubLogin, navigate]);

  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner size={22} />
        <div className="text-[14px] text-text-secondary">{t("auth.oauth.connecting")}</div>
      </div>
    </AuthShell>
  );
}
