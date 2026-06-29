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

/**
 * Capture a DOM node to a PNG and share it: the Web Share API where the browser
 * supports sharing files, otherwise a plain download. Resolves with which path
 * was taken. Rejects on real failures (html2canvas/toBlob) and propagates the
 * Web Share `AbortError` so callers can treat a dismissed sheet as a silent
 * cancellation via {@link isShareCancellation}.
 */
export async function captureAndShare(
  el: HTMLElement,
  filename: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(el, {
    useCORS: true,
    scale: 2,
    backgroundColor: null,
    logging: false,
  });
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Canvas export failed"))),
      "image/png",
    ),
  );
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
