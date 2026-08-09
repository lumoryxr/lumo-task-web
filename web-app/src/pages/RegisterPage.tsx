import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { LegalModal } from "@/components/LegalModal";
import { RecoveryCodeCard } from "@/components/RecoveryCodeCard";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { presentError, fieldErrorsFor } from "@/lib/presentError";
import { validateRegister } from "@/lib/authValidation";
import { ApiError } from "@/api/ApiError";
import { Spinner } from "@/components/Spinner";
import type { LegalDocKey } from "@/pages/legal/content";

/**
 * /register — username + password + confirm + ToS (username-first, #17).
 *
 * On success we surface the one-time recovery code (copy/download + an "I've
 * saved it" gate) BEFORE routing on; the account is already created and signed
 * in at that point.
 */
export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [legalDoc, setLegalDoc] = useState<LegalDocKey | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;
    // Validate client-side FIRST — instant, localized, inline feedback under the
    // offending field (mirrors the backend rules), instead of a round-trip that
    // returns a raw English string (or, on a skewed backend, nothing).
    const clientErrors = validateRegister({ username, password, confirm });
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(
        Object.fromEntries(Object.entries(clientErrors).map(([field, key]) => [field, t(key)])),
      );
      return;
    }
    setFieldErrors({});
    try {
      const code = await register({ username, password, confirm });
      // The account is created and signed in at this point. Normally we gate on
      // saving the one-time recovery code; if the server didn't return one
      // (unexpected — e.g. a stale backend), route on rather than hang silently.
      if (code) setRecoveryCode(code);
      else navigate("/today");
    } catch (err) {
      // Server-side failure. Render field errors this form shows inline; map a
      // taken-username conflict to the username field; anything else surfaces as
      // a localized toast (never a silent no-op).
      const fe = fieldErrorsFor(err, ["username", "password", "confirm"]);
      if (err instanceof ApiError && err.code === "USERNAME_TAKEN") {
        fe.username = t("error.code.USERNAME_TAKEN");
      }
      if (Object.keys(fe).length > 0) setFieldErrors(fe);
      else presentError(err, "error.auth.register");
    }
  }

  // Post-registration: gate on saving the one-time recovery code before routing.
  if (recoveryCode) {
    return (
      <AuthShell>
        <div className="fade-in">
          <RecoveryCodeCard code={recoveryCode} onContinue={() => navigate("/today")} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="fade-in">
        <div className="text-[22px] font-semibold tracking-tight text-text-primary text-center" style={{ letterSpacing: "-0.01em" }}>
          {t("auth.register.h")}
        </div>
        <div className="mt-1.5 text-xs text-text-secondary leading-relaxed text-center">
          {t("auth.register.sub")}
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <Field label={t("auth.username")} error={fieldErrors.username} help={t("auth.username.help")}>
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
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t("auth.confirm")} error={fieldErrors.confirm}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          <label className="flex items-start gap-2.5 mt-1 text-[12px] text-text-secondary leading-relaxed">
            <button
              type="button"
              onClick={() => setAgreed((v) => !v)}
              className="flex items-center justify-center flex-shrink-0 rounded-[3px] mt-px transition-colors"
              style={{
                width: 14,
                height: 14,
                background: "var(--bg-elevated)",
                border: "1.5px solid var(--border-strong)",
              }}
            >
              {agreed && (
                <span className="rounded-[1px]" style={{ width: 8, height: 8, background: "var(--accent-primary)" }} />
              )}
            </button>
            <span>
              {t("auth.terms")}{" "}
              <button
                type="button"
                className="underline hover:text-text-primary"
                onClick={(e) => { e.stopPropagation(); setLegalDoc("terms"); }}
              >
                {t("legal.terms.link")}
              </button>
              {" · "}
              <button
                type="button"
                className="underline hover:text-text-primary"
                onClick={(e) => { e.stopPropagation(); setLegalDoc("privacy"); }}
              >
                {t("legal.privacy.link")}
              </button>
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full justify-center mt-1"
            disabled={loading || !agreed}
            aria-busy={loading}
            aria-label={t("auth.register.btn")}
          >
            {loading ? <Spinner size={18} /> : t("auth.register.btn")}
          </button>
        </div>

        <div className="mt-4 flex justify-center gap-3.5 text-xs text-text-secondary">
          <button type="button" className="hover:text-text-primary transition-colors" onClick={() => navigate("/login")}>
            {t("auth.tologin")}
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
  help,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  help?: string;
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
      {error ? (
        <span role="alert" className="block text-[11px] mt-1" style={{ color: "var(--status-urgent)" }}>
          {error}
        </span>
      ) : help ? (
        <span className="block text-[11px] mt-1 text-text-faint">{help}</span>
      ) : null}
    </label>
  );
}
