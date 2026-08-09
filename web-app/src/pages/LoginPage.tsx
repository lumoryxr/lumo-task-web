import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { OAuthButton } from "@/components/OAuthButton";
import { LegalModal } from "@/components/LegalModal";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/api/client";
import { toast } from "@/store/useToastStore";
import { presentError, fieldErrorsFor } from "@/lib/presentError";
import { validateSignin } from "@/lib/authValidation";
import { Spinner } from "@/components/Spinner";
import type { LegalDocKey } from "@/pages/legal/content";

/**
 * /login — username + password, plus a single GitHub OAuth button that is
 * rendered only when the backend reports GitHub login enabled (#15). Sign-in
 * is mandatory (#14): there is no "continue without an account" escape hatch.
 */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { signIn, loading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);
  // GitHub login is env-gated on the backend: only render its button once the
  // server reports it enabled. `null` = still unknown (hide until we know), so a
  // not-yet-configured production never flashes a button that would 501.
  const [githubEnabled, setGithubEnabled] = useState<boolean | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [searchParams] = useSearchParams();
  const oauthErrorShown = useRef(false);

  useEffect(() => {
    let active = true;
    api
      .getGithubConfig()
      .then((cfg) => { if (active) setGithubEnabled(cfg.githubEnabled); })
      .catch(() => { if (active) setGithubEnabled(false); });
    return () => { active = false; };
  }, []);

  // A failed GitHub sign-in redirects back here as /login?error=oauth. Surface
  // it once (ref-guarded so a re-render can't re-toast the same failure).
  useEffect(() => {
    if (searchParams.get("error") === "oauth" && !oauthErrorShown.current) {
      oauthErrorShown.current = true;
      toast.error(t("auth.oauth.err"));
    }
  }, [searchParams, t]);

  async function startGithub() {
    setRedirecting(true);
    try {
      // Full-page navigation so the browser follows the 302 to GitHub (an XHR
      // cannot complete the cross-origin auth redirect).
      window.location.href = await api.githubStartUrl();
    } catch (err) {
      setRedirecting(false);
      presentError(err, "error.auth.signin");
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const clientErrors = validateSignin({ username, password });
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(
        Object.fromEntries(Object.entries(clientErrors).map(([field, key]) => [field, t(key)])),
      );
      return;
    }
    setFieldErrors({});
    try {
      await signIn(username, password);
      navigate("/today");
    } catch (err) {
      // Only field errors for inputs THIS form renders count as handled inline;
      // everything else (wrong credentials, or a validation error for a field
      // the form doesn't show) surfaces via the unified toast — never silent.
      const fe = fieldErrorsFor(err, ["username", "password"]);
      if (Object.keys(fe).length > 0) setFieldErrors(fe);
      else presentError(err, "error.auth.signin");
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="fade-in">
        <div className="text-[22px] font-semibold tracking-tight text-text-primary text-center" style={{ letterSpacing: "-0.01em" }}>
          {t("auth.login.h")}
        </div>
        <div className="mt-1.5 text-xs text-text-secondary leading-relaxed text-center">
          {t("auth.login.sub")}
        </div>

        <div className="mt-[22px] flex flex-col gap-3">
          <Field label={t("auth.username")} error={fieldErrors.username}>
            <input
              className="input"
              type="text"
              autoComplete="username"
              placeholder={t("auth.username.ph")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t("auth.password")} error={fieldErrors.password}>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full justify-center mt-1"
            disabled={loading}
            aria-busy={loading}
            aria-label={t("auth.login.btn")}
          >
            {loading ? <Spinner size={18} /> : t("auth.login.btn")}
          </button>
        </div>

        {githubEnabled && (
          <>
            <Divider label={t("auth.or")} />
            <div className="flex flex-col gap-2">
              <OAuthButton
                provider="github"
                label={t("auth.github")}
                onClick={startGithub}
                disabled={redirecting}
              />
            </div>
          </>
        )}

        <div className="mt-[18px] flex justify-center gap-3.5 text-xs text-text-secondary">
          <button
            type="button"
            className="hover:text-text-primary transition-colors"
            onClick={() => navigate("/forgot-password")}
          >
            {t("auth.forgot")}
          </button>
          <span className="text-text-faint">·</span>
          <button
            type="button"
            className="hover:text-text-primary transition-colors"
            onClick={() => navigate("/register")}
          >
            {t("auth.toregister")}
          </button>
        </div>

        {/* Legal — opens the policy in a modal without leaving the auth screen. */}
        <div className="mt-3 flex justify-center gap-2 text-[11px] text-text-faint">
          <button
            type="button"
            className="hover:text-text-secondary transition-colors"
            onClick={() => setLegalDoc("terms")}
          >
            {t("legal.terms.link")}
          </button>
          <span>·</span>
          <button
            type="button"
            className="hover:text-text-secondary transition-colors"
            onClick={() => setLegalDoc("privacy")}
          >
            {t("legal.privacy.link")}
          </button>
        </div>

        <LegalModal docKey={legalDoc} onClose={() => setLegalDoc(null)} />
      </form>
    </AuthShell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-[12px] font-medium text-text-secondary mb-1.5"
        style={{ letterSpacing: "0.01em" }}
      >
        {label}
      </span>
      {children}
      {error && (
        <span role="alert" className="block text-[11px] mt-1" style={{ color: "var(--status-urgent)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-border-faint" />
      <span className="text-[11px] uppercase tracking-[0.1em] text-text-faint">{label}</span>
      <div className="flex-1 h-px bg-border-faint" />
    </div>
  );
}
