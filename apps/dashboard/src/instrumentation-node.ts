import { assertTestAuthNotInProduction } from './lib/test-auth';

// A production server carrying the end-to-end sign-in bypass flag exits
// instead of serving (src/lib/test-auth.ts).
try {
  assertTestAuthNotInProduction();
} catch (err) {
  console.error(`[startup] ${(err as Error).message}`);
  process.exit(1);
}
