import { z } from "zod";

/**
 * Calendar interop (#169 V1). The read-only `.ics` feed itself is served as
 * `text/calendar` (not JSON), so only the management endpoints have JSON
 * response shapes.
 */

/**
 * Response of `GET /v1/calendar/feed` and `POST /v1/calendar/feed/rotate`:
 * the subscribable secret URL and its raw token. The token is re-displayable
 * because it is stored AES-encrypted at rest (decrypted here), while the public
 * feed looks it up by an irreversible SHA-256 hash.
 */
export const CalendarFeedResponseSchema = z.object({
  token: z.string(),
  url: z.string().url(),
});
export type CalendarFeedResponse = z.infer<typeof CalendarFeedResponseSchema>;
