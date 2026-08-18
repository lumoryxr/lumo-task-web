import { useMemo } from "react";
import QRCode from "qrcode";
import { SITE_LABEL, shareLink, type ShareSurface } from "@/config/app";
import { useT } from "@/i18n/useT";

/**
 * Brand + scan-to-open footer for every shareable card.
 *
 * Shared screenshots are the app's main organic reach: a card that only prints
 * a domain in text makes the reader retype it (and the cards used to print a
 * `lumo.app` we don't even own). A QR turns the screenshot into a one-scan
 * entry point, which is how these images actually get opened on WeChat /
 * Xiaohongshu, and each surface tags its link with `?ref=` so the traffic is
 * attributable to the card that produced it.
 *
 * Rendering note: the QR is rasterised to a data-URI <img> rather than SVG or a
 * grid of divs, because these cards are captured with html2canvas — data-URI
 * images are the one form it reproduces reliably, and it keeps the captured DOM
 * to a single node instead of ~1000 module divs.
 */

/** Quiet zone (in modules) required around a QR for reliable scanning. */
const QUIET_ZONE = 2;

/**
 * Rasterise `text` to a black-on-white QR data URI, or return null when a
 * canvas isn't available (jsdom in unit tests) so callers can degrade to the
 * text-only footer instead of crashing.
 */
function useQrDataUrl(text: string, pixelsPerModule = 4): string | null {
  return useMemo(() => {
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
      const n = qr.modules.size;
      const data = qr.modules.data;
      const side = (n + QUIET_ZONE * 2) * pixelsPerModule;

      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // White field (includes the quiet zone) then the dark modules.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.fillStyle = "#000000";
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (data[y * n + x]) {
            ctx.fillRect(
              (x + QUIET_ZONE) * pixelsPerModule,
              (y + QUIET_ZONE) * pixelsPerModule,
              pixelsPerModule,
              pixelsPerModule,
            );
          }
        }
      }
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }, [text, pixelsPerModule]);
}

export interface ShareBrandFooterProps {
  /** Which card this is, so the encoded link can be attributed. */
  surface: ShareSurface;
  /** Optional trailing text (e.g. the user's name) shown under the wordmark. */
  caption?: string;
  /** Rendered QR edge length in CSS pixels. */
  qrSize?: number;
}

export function ShareBrandFooter({ surface, caption, qrSize = 52 }: ShareBrandFooterProps) {
  const t = useT();
  const qr = useQrDataUrl(shareLink(surface));

  return (
    <div
      className="flex items-center gap-3 pt-3"
      style={{ borderTop: "1px solid var(--border-faint)" }}
    >
      {qr && (
        <img
          src={qr}
          alt=""
          aria-hidden="true"
          width={qrSize}
          height={qrSize}
          style={{
            width: qrSize,
            height: qrSize,
            borderRadius: "var(--radius-sm)",
            flexShrink: 0,
            // A hair of padding keeps the quiet zone intact against the card.
            background: "#ffffff",
            padding: 2,
          }}
        />
      )}
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-text-primary leading-tight">
          Lumo Task
        </div>
        <div className="text-[10px] text-text-muted mt-0.5 truncate">
          {t("share.scan")} · {SITE_LABEL}
        </div>
        {caption && (
          <div className="text-[10px] text-text-faint mt-0.5 truncate">{caption}</div>
        )}
      </div>
    </div>
  );
}
