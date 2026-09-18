/**
 * Runs once when the server starts, including the standalone server in the
 * container, which never reads next.config.ts. The Node.js half refuses to
 * serve when the end-to-end sign-in bypass flag is set in production.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
