/**
 * Header names of the v1 API. Lowercase, since HTTP header names are
 * case-insensitive and both Node and the Fetch API normalise to lowercase.
 */

/** `Authorization: Bearer <workspace API key>` for clients. */
export const AUTHORIZATION_HEADER = 'authorization';
export const BEARER_PREFIX = 'Bearer ';

/**
 * Every mutating call accepts an idempotency key. Replaying the same key with the
 * same body within the retention window returns the first response; the same key
 * with a different body is `idempotency_key_reused` (409).
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
export const IDEMPOTENCY_KEY_RETENTION_HOURS = 24;

/**
 * The dashboard calls the service server-side with a dashboard service token in
 * `Authorization` and the signed-in person's auth-brain subject here. The service
 * checks that subject's membership and role in the workspace named by
 * `WORKSPACE_HEADER`. A workspace API key never needs either header: the key is
 * already scoped to one workspace.
 */
export const SUBJECT_HEADER = 'x-mail-subject';
export const WORKSPACE_HEADER = 'x-mail-workspace';

/** Echoed on every response, and quoted in logs and support requests. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Sent with 429 responses: seconds until a retry can succeed. */
export const RETRY_AFTER_HEADER = 'retry-after';

export const API_VERSION_PREFIX = '/v1';

/** Liveness probe, outside the versioned API and without credentials. */
export const HEALTH_PATH = '/healthz';
