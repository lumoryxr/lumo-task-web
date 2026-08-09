import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "@/components/AuthShell";
import { useT } from "@/i18n/useT";
import { useAuthStore } from "@/store/useAuthStore";
import { presentError } from "@/lib/presentError";
import { ApiError } from "@/api/ApiError";
import { Spinner } from "@/components/Spinner";
import { IconCheck } from "@/components/icons";

type Mode = "email" | "code";

/**
 * /forgot-password — two recovery channels behind one entry point:
 *   • Email link — enumeration-safe; only useful if a verified email is bound.
 *   • Recovery code — the universal offline fallback (username + saved code).
 */
export function ForgotPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("email");

  return (
    <AuthShell onBack={() => navigate("/login")}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "var(--bg-deep)" }}>
          <TabButton active={mode === "email"} onClick={() => setMode("email")}>
            {t("auth.forgot.tab.email")}
          </TabButton>
          <TabButton active={mode === "code"} onClick={() => setMode("code")}>
            {t("auth.forgot.tab.code")}
          </TabButton>
        </div>
        {mode === "email" ? <EmailBranch /> : <CodeBranch />}
      </div>
    </AuthShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-md py-1.5 text-[12.5px] font-medium transition-colors"
      style={{
        background: active ? "var(--bg-surface)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        border: active ? "1px solid var(--border-default)" : "1px solid transparent",
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/** Email-link channel — the original enumeration-safe flow. */
function EmailBranch() {
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

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
        >
          <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
        </div>
        <div className="text-[15px] font-semibold text-text-primary">{t("auth.forgot.sent.title")}</div>
        <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.forgot.sent.body")}</div>
        <button type="button" className="btn btn-secondary mt-2" onClick={() => navigate("/login")}>
          {t("auth.forgot.backToLogin")}
        </button>
      </div>
    );
  }

  return (
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
  );
}

/** Recovery-code channel — the universal offline fallback. */
function CodeBranch() {
  const t = useT();
  const navigate = useNavigate();
  const recoveryReset = useAuthStore((s) => s.recoveryReset);
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !username.trim() || !code.trim() || !newPassword) return;
    setLoading(true);
    setInvalid(false);
    try {
      await recoveryReset({ username: username.trim(), code: code.trim(), newPassword });
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_RECOVERY_CODE") {
        setInvalid(true);
      } else {
        presentError(err, "auth.forgot.code.err");
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: "var(--accent-fog)", border: "1px solid var(--accent-edge)" }}
        >
          <IconCheck size={18} style={{ color: "var(--accent-primary)" }} />
        </div>
        <div className="text-[15px] font-semibold text-text-primary">{t("auth.forgot.code.success.title")}</div>
        <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.forgot.code.success.body")}</div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="text-center mb-1">
        <div className="text-[16px] font-semibold text-text-primary">{t("auth.forgot.code.title")}</div>
        <div className="text-[12.5px] text-text-secondary mt-1 leading-relaxed">{t("auth.forgot.code.subtitle")}</div>
      </div>

      <label className="text-[12px] text-text-secondary">
        {t("auth.username")}
        <input
          autoFocus
          type="text"
          autoComplete="username"
          placeholder={t("auth.username.ph")}
          value={username}
          className="input mt-1"
          style={{ width: "100%" }}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>

      <label className="text-[12px] text-text-secondary">
        {t("auth.forgot.code.code")}
        <input
          type="text"
          placeholder="LUMO-XXXX-XXXX-XXXX-XXXX"
          value={code}
          className="input mt-1 font-mono"
          style={{ width: "100%" }}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>

      <label className="text-[12px] text-text-secondary">
        {t("auth.forgot.code.newpass")}
        <input
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={newPassword}
          className="input mt-1"
          style={{ width: "100%" }}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>

      {invalid && (
        <span role="alert" className="block text-[11px]" style={{ color: "var(--status-urgent)" }}>
          {t("auth.forgot.code.invalid")}
        </span>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-lg w-full justify-center mt-1"
        disabled={loading || !username.trim() || !code.trim() || !newPassword}
        aria-busy={loading}
        aria-label={t("auth.forgot.code.submit")}
      >
        {loading ? <Spinner size={18} /> : t("auth.forgot.code.submit")}
      </button>

      <button
        type="button"
        className="text-[12px] text-text-secondary hover:text-text-primary transition-colors mt-1"
        onClick={() => navigate("/login")}
      >
        {t("auth.forgot.backToLogin")}
      </button>
    </form>
  );
}
