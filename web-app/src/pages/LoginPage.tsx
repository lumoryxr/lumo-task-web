import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { OAuthButton } from "@/components/OAuthButton";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { presentError, fieldErrorsOf } from "@/lib/presentError";

/**
 * /login — email + password + 3 OAuth providers + "continue without
 * account" escape hatch (Lumo is local-first; sign-in is optional).
 */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { signIn, loading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setFieldErrors({});
    try {
      await signIn(email, password);
      navigate("/today");
    } catch (err) {
      // Validation failures get inline messages under the offending input;
      // everything else (e.g. wrong credentials) surfaces via the unified toast.
      const fe = fieldErrorsOf(err);
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
          <Field label={t("auth.email")} error={fieldErrors.email}>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          >
            {loading ? "…" : t("auth.login.btn")}
          </button>
        </div>

        <Divider label={t("auth.or")} />

        <div className="flex flex-col gap-2">
          <OAuthButton provider="google" label={t("auth.google")} comingSoon />
          <OAuthButton provider="apple" label={t("auth.apple")} comingSoon />
          <OAuthButton provider="github" label={t("auth.github")} comingSoon />
        </div>

        <div className="mt-[18px] flex justify-center gap-3.5 text-xs text-text-secondary">
          <button type="button" className="hover:text-text-primary transition-colors">
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
          <span className="text-text-faint">·</span>
          <button
            type="button"
            className="hover:text-text-primary transition-colors"
            onClick={() => navigate("/today")}
          >
            {t("auth.localonly")}
          </button>
        </div>

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
