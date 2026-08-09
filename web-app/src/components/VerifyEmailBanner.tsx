import { useState } from "react";
import { useT } from "@/i18n/useT";
import { toast } from "@/store/useToastStore";
import { presentError } from "@/lib/presentError";
import { selectIsSignedIn, useAuthStore } from "@/store/useAuthStore";

const DISMISS_KEY = "lumo.verifyBanner.dismissed";

/**
 * A soft "verify your email" nudge shown at the top of the app frame while the
 * signed-in account is unverified. Verification is non-blocking, so this is a
 * gentle prompt — dismissable for the session — with a one-tap resend.
 */
export function VerifyEmailBanner() {
  const t = useT();
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const user = useAuthStore((s) => s.user);
  const resendVerification = useAuthStore((s) => s.resendVerification);

  // Dismissed for this browser session only — it returns next session until verified.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [sending, setSending] = useState(false);

  // Only nudge a signed-in account that has an email BOUND but not yet verified.
  // A username-only account (no email) is never nudged — email is optional.
  if (!isSignedIn || !user.email || user.emailVerified !== false || dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sessionStorage unavailable — dismiss for this render only */
    }
    setDismissed(true);
  }

  async function resend() {
    if (sending) return;
    setSending(true);
    try {
      await resendVerification();
      toast.success(t("banner.verify.sent"));
    } catch (err) {
      presentError(err, "banner.verify.err");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-5 py-2.5 text-[12.5px] border-b"
      style={{
        background: "var(--accent-fog)",
        borderColor: "var(--accent-edge)",
        color: "var(--text-primary)",
      }}
    >
      <span className="flex-1 min-w-0">
        {t("banner.verify.text")}
        {user.email ? <span className="text-text-secondary"> · {user.email}</span> : null}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ height: 28, padding: "0 12px", fontSize: 12 }}
        onClick={resend}
        disabled={sending}
        aria-busy={sending}
      >
        {sending ? t("banner.verify.sending") : t("banner.verify.resend")}
      </button>
      <button
        type="button"
        className="text-text-muted hover:text-text-primary"
        onClick={dismiss}
        aria-label={t("banner.verify.dismiss")}
        style={{ lineHeight: 1, fontSize: 16 }}
      >
        ×
      </button>
    </div>
  );
}
