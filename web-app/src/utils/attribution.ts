/**
 * First-touch acquisition attribution.
 *
 * Share cards, QR codes and posts to each channel all carry a tag (`?ref=…`,
 * or standard `utm_source`/`utm_campaign`), so the question "which channel
 * actually brings people back" has an answer instead of a guess. This module
 * is the capture half: it reads the tag off the landing URL, keeps the FIRST
 * one it ever saw for this browser, and cleans the parameters out of the
 * address bar so a shared/bookmarked URL doesn't re-attribute someone else.
 *
 * First-touch (not last-touch) on purpose: the channel that first introduced
 * someone is the one worth crediting for acquisition. A later visit through a
 * different card shouldn't overwrite it.
 *
 * This is deliberately storage-only and contains no network calls. Sending the
 * captured value to the backend at signup is an API change, and API shapes are
 * contract-first (`@lumo/contracts`) — so that step belongs in its own change,
 * with the contract edited first.
 */

const STORAGE_KEY = "lumo.attribution.v1";

/** Query parameters we accept as a channel tag, in priority order. */
const TAG_PARAMS = ["ref", "utm_source"] as const;
/** Extra parameters worth keeping alongside the tag when present. */
const EXTRA_PARAMS = ["utm_medium", "utm_campaign"] as const;
/** Everything stripped from the visible URL once captured. */
const STRIP_PARAMS = [...TAG_PARAMS, ...EXTRA_PARAMS] as const;

/** Tags are analytics keys, so keep them short and boring. */
const MAX_TAG_LENGTH = 64;
const SAFE_TAG = /^[a-zA-Z0-9_.:-]+$/;

export interface Attribution {
  /** The channel tag, e.g. "share-weekly" or "sspai". */
  source: string;
  /** Optional UTM medium, when the link carried one. */
  medium?: string;
  /** Optional UTM campaign, when the link carried one. */
  campaign?: string;
  /** ISO timestamp of the first visit that carried a tag. */
  firstSeen: string;
}

function sanitize(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, MAX_TAG_LENGTH);
  // Reject anything that isn't a plain key — these values end up in analytics
  // and (later) a request body, so never carry arbitrary user-controlled text.
  return SAFE_TAG.test(trimmed) ? trimmed : undefined;
}

/** Read the stored first-touch attribution, or null if none was ever captured. */
export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    return typeof parsed?.source === "string" && typeof parsed?.firstSeen === "string"
      ? (parsed as Attribution)
      : null;
  } catch {
    // Private mode / disabled storage / corrupt JSON — attribution is a
    // nice-to-have, never a reason to break the app.
    return null;
  }
}

/**
 * Capture the channel tag from the current URL.
 *
 * Call once on app start. Returns the effective attribution (existing or newly
 * captured), or null when the visit carried no tag and none was stored.
 */
export function captureAttribution(
  search: string = window.location.search,
): Attribution | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return getAttribution();
  }

  let source: string | undefined;
  for (const key of TAG_PARAMS) {
    source = sanitize(params.get(key));
    if (source) break;
  }

  const existing = getAttribution();

  if (source && !existing) {
    const record: Attribution = {
      source,
      medium: sanitize(params.get("utm_medium")),
      campaign: sanitize(params.get("utm_campaign")),
      firstSeen: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Non-fatal — we simply don't remember this visit's channel.
    }
    stripFromUrl(params);
    return record;
  }

  // Already attributed (or nothing to capture): still tidy the URL so the tag
  // can't be copied out of the address bar and mis-credit a later visitor.
  if (source) stripFromUrl(params);
  return existing;
}

/** Remove the tracking parameters from the address bar without navigating. */
function stripFromUrl(params: URLSearchParams): void {
  try {
    let touched = false;
    for (const key of STRIP_PARAMS) {
      if (params.has(key)) {
        params.delete(key);
        touched = true;
      }
    }
    if (!touched || typeof window.history?.replaceState !== "function") return;
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  } catch {
    // Cosmetic only.
  }
}
