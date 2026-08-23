export type Variables = {
  userId: string;
  jti: string;
  /** Per-request correlation id, set by the app-level correlation middleware. */
  requestId?: string;
  /** W3C trace id (32 hex) for the request, set by the correlation middleware. */
  traceId?: string;
  /** W3C span id (16 hex) minted for this hop, set by the correlation middleware. */
  spanId?: string;
};
