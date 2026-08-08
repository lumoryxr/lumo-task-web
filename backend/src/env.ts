export type Variables = {
  userId: string;
  jti: string;
  /** Per-request trace id, set by the app-level correlation middleware. */
  requestId?: string;
};
