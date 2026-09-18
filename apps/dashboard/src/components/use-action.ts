'use client';

import { useCallback, useState, useTransition } from 'react';
import type { ActionError, ActionResult } from '@/lib/result';

/**
 * Runs a server action from an event handler, tracking pending, the error and
 * per-field messages. The error stays until the next attempt, so a failure is
 * never replaced by silence.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const run = useCallback(
    <T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) =>
      new Promise<ActionResult<T>>((resolve) => {
        setError(null);
        start(async () => {
          let result: ActionResult<T>;
          try {
            result = await action();
          } catch {
            // The action itself did not answer (a deploy replaced it, the
            // network dropped). Say so rather than leave the button spinning.
            result = {
              ok: false,
              error: { code: 'network', message: 'The dashboard did not answer. Reload the page and try again.' },
            };
          }
          if (result.ok) onSuccess?.(result.data);
          else setError(result.error);
          resolve(result);
        });
      }),
    [],
  );

  return { run, pending, error, fields: error?.fields ?? {}, clearError: () => setError(null) };
}
