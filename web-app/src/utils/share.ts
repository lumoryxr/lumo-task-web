/**
 * The Web Share API rejects with a `DOMException` named `"AbortError"` when the
 * user dismisses the native share sheet. That is a normal cancellation, not a
 * failure, so callers should stay silent.
 *
 * Any other rejection (an html2canvas crash, a `canvas.toBlob` failure, or a
 * denied share permission) is a real export error the user should be told
 * about — otherwise the button just silently does nothing and looks broken.
 */
export function isShareCancellation(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
