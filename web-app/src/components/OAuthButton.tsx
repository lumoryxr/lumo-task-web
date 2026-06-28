/**
 * OAuth provider button — flat brand glyph + label, matches the .btn
 * styling. Provider icons rendered inline so no extra deps.
 */
import type { ReactNode } from "react";

type Provider = "google" | "apple" | "github";

const ICONS: Record<Provider, ReactNode> = {
  google: (
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#fff" opacity=".7" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4H3.2v2.5A10 10 0 0 0 12 22z" />
      <path fill="#fff" opacity=".5" d="M6.5 14.1A6 6 0 0 1 6.2 12c0-.7.1-1.4.3-2.1V7.4H3.2A10 10 0 0 0 2 12c0 1.6.4 3.2 1.2 4.6l3.3-2.5z" />
      <path fill="#fff" opacity=".85" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A10 10 0 0 0 12 2 10 10 0 0 0 3.2 7.4l3.3 2.5A5.9 5.9 0 0 1 12 6z" />
    </svg>
  ),
  apple: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
      <path d="M17.05 12.5c0-2.7 2.2-4 2.3-4-.1-.2-1.3-2-3.3-2-1.4 0-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-2.5 0-5 2-5 5.8 0 3.6 2.7 7.7 4.3 7.7.8 0 1.6-.5 3.1-.5s2.1.6 3 .6c1.6 0 4-3.4 4-5-.2-.1-2.9-.7-2.9-2.6zM14.5 4.6c.8-1 1.4-2.3 1.2-3.6-1.2 0-2.6.8-3.4 1.7-.7.9-1.4 2.3-1.2 3.6 1.3.1 2.6-.7 3.4-1.7z" />
    </svg>
  ),
  github: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.4-1.2-1.1-1.5-1.1-1.5-1-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 1 1.6 2.4 1.2 3 .9.1-.7.4-1.2.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.8v2.6c0 .3.2.6.7.5A10 10 0 0 0 12 2z" />
    </svg>
  ),
};

export function OAuthButton({
  provider,
  label,
  onClick,
  disabled,
  comingSoon,
}: {
  provider: Provider;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      className="btn btn-secondary w-full justify-center"
      onClick={onClick}
      disabled={disabled || comingSoon}
      title={comingSoon ? "Coming soon" : undefined}
    >
      {ICONS[provider]}
      <span>{label}</span>
      {comingSoon && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            fontWeight: 500,
            color: "var(--text-faint)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            padding: "1px 5px",
            lineHeight: "1.4",
          }}
        >
          Soon
        </span>
      )}
    </button>
  );
}
