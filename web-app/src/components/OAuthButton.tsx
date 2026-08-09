/**
 * OAuth provider button — flat brand glyph + label, matches the .btn styling.
 * GitHub is the only supported third-party login (#15); the Google/Apple stubs
 * were removed. The icon is rendered inline so no extra deps are needed.
 */
type Provider = "github";

const ICONS: Record<Provider, React.ReactNode> = {
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
}: {
  provider: Provider;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary w-full justify-center"
      onClick={onClick}
      disabled={disabled}
    >
      {ICONS[provider]}
      <span>{label}</span>
    </button>
  );
}
