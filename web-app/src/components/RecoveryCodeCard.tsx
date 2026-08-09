import { useState } from "react";
import { useT } from "@/i18n/useT";
import { IconCheck } from "@/components/icons";

/**
 * Presents a one-time recovery code with Copy + Download affordances, and an
 * optional "I've saved it" gate before continuing. Used at registration (with
 * the gate → routes on) and on the account page's regenerate modal (no gate).
 *
 * The plaintext code is shown exactly once by the caller; this component never
 * fetches or persists it.
 */
export function RecoveryCodeCard({
  code,
  onContinue,
}: {
  code: string;
  /** When provided, renders the "I've saved it" checkbox gate + Continue button. */
  onContinue?: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — Download remains as the fallback */
    }
  }

  function download() {
    const blob = new Blob([`Lumo recovery code\n\n${code}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lumo-recovery-code.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[15px] font-semibold text-text-primary">{t("auth.register.recovery.title")}</div>
      <div className="text-[12.5px] text-text-secondary leading-relaxed">{t("auth.register.recovery.body")}</div>

      <div
        className="rounded-lg px-4 py-3 text-center font-mono tracking-wider select-all"
        style={{
          background: "var(--bg-deep)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
          fontSize: 16,
        }}
        data-testid="recovery-code"
      >
        {code}
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary flex-1 justify-center" onClick={copy}>
          {copied ? (
            <>
              <IconCheck size={14} style={{ color: "var(--accent-primary)" }} />
              {t("auth.register.recovery.copied")}
            </>
          ) : (
            t("auth.register.recovery.copy")
          )}
        </button>
        <button type="button" className="btn btn-secondary flex-1 justify-center" onClick={download}>
          {t("auth.register.recovery.download")}
        </button>
      </div>

      {onContinue && (
        <>
          <label className="flex items-start gap-2.5 mt-1 text-[12px] text-text-secondary leading-relaxed">
            <button
              type="button"
              onClick={() => setSaved((v) => !v)}
              aria-pressed={saved}
              aria-label={t("auth.register.recovery.saved")}
              className="flex items-center justify-center flex-shrink-0 rounded-[3px] mt-px transition-colors"
              style={{
                width: 14,
                height: 14,
                background: "var(--bg-elevated)",
                border: "1.5px solid var(--border-strong)",
              }}
            >
              {saved && (
                <span className="rounded-[1px]" style={{ width: 8, height: 8, background: "var(--accent-primary)" }} />
              )}
            </button>
            <span>{t("auth.register.recovery.saved")}</span>
          </label>

          <button
            type="button"
            className="btn btn-primary btn-lg w-full justify-center"
            disabled={!saved}
            onClick={onContinue}
          >
            {t("auth.register.recovery.continue")}
          </button>
        </>
      )}
    </div>
  );
}
