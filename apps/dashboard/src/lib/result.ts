/**
 * What every server action returns to the browser: the data the screen needs,
 * or a human explanation of what went wrong. Plain JSON, safe for a client
 * component to import (no server code in here).
 */
export type ActionError = {
  /** The contract's error code, or `network` when the service could not be reached. */
  code: string;
  /** One sentence a person can act on. */
  message: string;
  /** Per-field messages, keyed by the field's path (`config.port`), for a form to show inline. */
  fields?: Record<string, string>;
  /** Quoted in support requests: the service's request id, when there was one. */
  requestId?: string | null;
  /** Extra facts a screen may use, e.g. `current_version` on a template conflict. */
  details?: Record<string, unknown>;
};

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
