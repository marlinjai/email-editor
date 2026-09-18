import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { describeError } from './errors';
import type { ActionError, ActionResult } from './result';

/** A refusal the dashboard itself decides (before or instead of calling the service), shown like a service error. */
export class DashboardRefusal extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'DashboardRefusal';
  }
}

/**
 * Runs one server action body and turns every failure into an `ActionResult`
 * the screen can show. Next's own control flow (redirect, notFound) passes
 * through untouched. A failure is logged with the service's request id, never
 * swallowed: the person sees it and the logs have it.
 */
export async function act<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DashboardRefusal) return { ok: false, error: { code: err.code, message: err.message, fields: err.fields } };
    const error = describeError(err);
    const logged = error.code === 'internal_error' || error.code === 'network' || error.code === 'service_unavailable';
    if (logged) console.error(`[action ${label}] ${error.code}${error.requestId ? ` (request ${error.requestId})` : ''}:`, err);
    return { ok: false, error };
  }
}

/** Validates form input before it reaches the service, answering in the same shape as the service would. */
export function parseInput<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; error: ActionError } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return { ok: false, error: { code: 'validation_failed', message: 'Some fields need attention.', fields } };
}
