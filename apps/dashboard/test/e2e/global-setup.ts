import { startStack } from './stack';

/** Starts the local stack once for the whole run; the returned function tears it down. */
export default async function globalSetup() {
  const stack = await startStack();
  process.env.E2E_SMTP_PORT = String(stack.smtpPort);
  return async () => {
    await stack.stop();
  };
}
