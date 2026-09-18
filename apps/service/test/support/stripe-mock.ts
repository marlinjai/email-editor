/**
 * stripe-mock (Stripe's own mock, validating requests against Stripe's API
 * description): STRIPE_MOCK_URL (CI: a service container) or Testcontainers.
 * Neither reachable fails the run, never skips it.
 */
export async function startStripeMock(): Promise<{ base: string; stop: () => Promise<void> }> {
  if (process.env.STRIPE_MOCK_URL) return { base: process.env.STRIPE_MOCK_URL, stop: async () => {} };
  const { GenericContainer, Wait } = await import('testcontainers');
  try {
    const container = await new GenericContainer('stripe/stripe-mock:latest')
      .withExposedPorts(12111)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    return {
      base: `http://${container.getHost()}:${container.getMappedPort(12111)}`,
      stop: async () => {
        await container.stop();
      },
    };
  } catch (err) {
    throw new Error(
      'The stripe-mock suites need STRIPE_MOCK_URL or Docker for Testcontainers (see the README, "Test it"). Cause: ' +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}
