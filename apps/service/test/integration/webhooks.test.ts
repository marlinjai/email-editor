import {
  verifyWebhook,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  type WebhookEvent,
} from '@marlinjai/mail-contract';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventInput } from '../../src/events.js';
import { emitEvent } from '../../src/events.js';
import { repos } from '../../src/repo/index.js';
import type { DueDelivery } from '../../src/repo/webhooks.js';
import { attemptDelivery } from '../../src/webhooks/deliver.js';
import { startWebhookDeliveryLoop } from '../../src/webhooks/loop.js';
import { WEBHOOK_SECRET_ROTATION_WINDOW_MS } from '../../src/webhooks/secret.js';
import { startHarness, type Harness } from '../support/harness.js';
import { TestReceiver } from '../support/receiver.js';

/*
 * webhooks.* routes and the delivery loop (S2, F4). Deliveries go to a real
 * local HTTP receiver (test/support/receiver.ts), never a mocked fetch, so a
 * signature check runs against bytes that actually crossed a socket.
 */

const OPEN_POLICY = { allowInsecureHttp: true, allowPrivateTargets: true };

let h: Harness;
let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
let wsCounter = 0;
beforeAll(async () => {
  h = await startHarness({ webhookUrlPolicy: OPEN_POLICY });
});
afterAll(() => h?.drop());

// A fresh workspace per test: emitEvent fans a delivery out to every enabled
// endpoint of the workspace subscribed to the type, so tests that create an
// endpoint and count receiver requests must not share one with an earlier
// test's now-closed receiver.
beforeEach(async () => {
  W = await h.seedWorkspace(`hooks-${++wsCounter}`);
});

let receiver: TestReceiver;
beforeEach(async () => {
  receiver = await TestReceiver.start();
});
afterEach(() => receiver.close());

function unsubscribed(email: string): EventInput {
  return {
    type: 'contact.unsubscribed',
    data: {
      contact_id: null,
      external_id: null,
      email,
      topic: null,
      mailing_id: null,
      source: 'api',
      unsubscribed_at: new Date().toISOString(),
    },
  };
}

async function createEndpoint(events: string[] = ['contact.unsubscribed'], url = receiver.url()) {
  const res = await h.call({
    method: 'POST',
    path: '/v1/webhooks',
    key: W.key,
    body: { url, events, enabled: true },
  });
  if (res.status !== 201) throw new Error(`create endpoint: ${JSON.stringify(res.body)}`);
  return res.body as { endpoint: { id: string; url: string }; secret: string };
}

/** Emits one event, without claiming its delivery (for tests that drive the loop or claim by hand). */
async function emitOnly(email = `d-${Date.now()}-${Math.random()}@example.com`): Promise<WebhookEvent> {
  return (await h.sql.begin((tx) => emitEvent(tx, W.id, unsubscribed(email)))) as WebhookEvent;
}

/**
 * Emits one event and claims the sole `DueDelivery` it queued for `endpoint`,
 * for a test that drives `attemptDelivery` by hand instead of through the loop.
 * Claiming leases the row for 60s, so it will not be picked up by a
 * concurrently running loop; a test that needs an unclaimed row uses `emitOnly`.
 */
async function queueOne(endpointId: string, email?: string): Promise<DueDelivery> {
  await emitOnly(email);
  // Each test runs in its own fresh workspace (see the outer beforeEach), so
  // at most one endpoint, and one queued delivery, exists in it at a time.
  const due = (await repos(h.sql).webhookDeliveries.claimDueForWorker(50, 60)).find((d) => d.workspace_id === W.id);
  if (!due) throw new Error('the emitted event queued no delivery for this endpoint');
  return due;
}

describe('webhook endpoint routes', () => {
  it('shows the signing secret once, on create, and never again', async () => {
    const created = await createEndpoint();
    expect(created.secret).toMatch(/^whsec_/);
    expect(created.endpoint).not.toHaveProperty('secret');

    const got = await h.call({ path: `/v1/webhooks/${created.endpoint.id}`, key: W.key });
    expect(JSON.stringify(got.body)).not.toContain(created.secret);
    const list = await h.call({ path: '/v1/webhooks', key: W.key });
    expect(JSON.stringify(list.body)).not.toContain(created.secret);

    const [row] = await h.sql<{ secret_sealed: string }[]>`SELECT secret_sealed FROM webhook_endpoints WHERE id = ${created.endpoint.id}`;
    expect(row!.secret_sealed.startsWith('sealed:v1:')).toBe(true);
    expect(h.sealer.open(row!.secret_sealed)).toBe(created.secret);
  });

  it('refuses a plain http URL without the development flag, even for a hostname the contract itself allows', async () => {
    const strict = await startHarness();
    const strictW = await strict.seedWorkspace('strict-http');
    // The contract's WebhookUrl always allows http for localhost/127.0.0.1 (so
    // SDK examples type-check); the service is stricter still, and needs its own
    // development flag before it accepts even this hostname over http.
    const res = await strict.call({
      method: 'POST',
      path: '/v1/webhooks',
      key: strictW.key,
      body: { url: receiver.url(), events: ['contact.unsubscribed'] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
    await strict.drop();
  });

  it('refuses a URL that resolves to a private address, even when http is allowed', async () => {
    const httpOnly = await startHarness({ webhookUrlPolicy: { allowInsecureHttp: true } });
    const w = await httpOnly.seedWorkspace('ssrf-create');
    const res = await httpOnly.call({
      method: 'POST',
      path: '/v1/webhooks',
      key: w.key,
      body: { url: receiver.url(), events: ['contact.unsubscribed'] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
    expect(res.body.error.message).toMatch(/private|loopback|link-local/);
    await httpOnly.drop();
  });

  it('updates url, events and enabled', async () => {
    const created = await createEndpoint(['contact.unsubscribed']);
    const updated = await h.call({
      method: 'PATCH',
      path: `/v1/webhooks/${created.endpoint.id}`,
      key: W.key,
      body: { events: ['contact.unsubscribed', 'contact.bounced'], enabled: false },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.events).toEqual(['contact.unsubscribed', 'contact.bounced']);
    expect(updated.body.enabled).toBe(false);
  });

  it('deletes an endpoint and its deliveries', async () => {
    const created = await createEndpoint();
    await queueOne(created.endpoint.id);
    const del = await h.call({ method: 'DELETE', path: `/v1/webhooks/${created.endpoint.id}`, key: W.key });
    expect(del.body).toEqual({ ok: true });
    expect((await h.call({ path: `/v1/webhooks/${created.endpoint.id}`, key: W.key })).status).toBe(404);
    const [row] = await h.sql`SELECT count(*)::int AS n FROM webhook_deliveries WHERE endpoint_id = ${created.endpoint.id}`;
    expect(row!.n).toBe(0);
  });

  it('records an audit entry for create, update, delete and rotate', async () => {
    const created = await createEndpoint();
    await h.call({ method: 'PATCH', path: `/v1/webhooks/${created.endpoint.id}`, key: W.key, body: { enabled: false } });
    await h.call({ method: 'POST', path: `/v1/webhooks/${created.endpoint.id}/rotate-secret`, key: W.key });
    await h.call({ method: 'DELETE', path: `/v1/webhooks/${created.endpoint.id}`, key: W.key });
    const audit = await h.call({ path: `/v1/audit-log?target_id=${created.endpoint.id}&limit=100`, key: W.key });
    const actions = audit.body.data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['webhook.created', 'webhook.updated', 'webhook.secret_rotated', 'webhook.deleted']));
  });
});

describe('tenancy isolation', () => {
  it("another workspace's key cannot read, update, delete, rotate, list deliveries of or redeliver an endpoint", async () => {
    const created = await createEndpoint();
    const other = await h.seedWorkspace('hooks-other');
    for (const call of [
      { method: 'GET', path: `/v1/webhooks/${created.endpoint.id}` },
      { method: 'PATCH', path: `/v1/webhooks/${created.endpoint.id}`, body: { enabled: false } },
      { method: 'DELETE', path: `/v1/webhooks/${created.endpoint.id}` },
      { method: 'POST', path: `/v1/webhooks/${created.endpoint.id}/rotate-secret` },
      { method: 'GET', path: `/v1/webhooks/${created.endpoint.id}/deliveries` },
      { method: 'POST', path: `/v1/webhooks/${created.endpoint.id}/deliveries/00000000-0000-0000-0000-000000000000/redeliver` },
    ] as const) {
      const res = await h.call({ ...call, key: other.key });
      expect(res.status, `${call.method} ${call.path}`).toBe(404);
    }
    const list = await h.call({ path: '/v1/webhooks', key: other.key });
    expect(list.body.data.map((e: { id: string }) => e.id)).not.toContain(created.endpoint.id);
  });
});

describe('the delivery loop', () => {
  it('forward: delivers a queued event, correctly signed, and marks it succeeded', async () => {
    const created = await createEndpoint();
    receiver.setDefault({ status: 200, body: 'ok' });
    await h.sql.begin((tx) => emitEvent(tx, W.id, unsubscribed('forward@example.com')));

    const loop = startWebhookDeliveryLoop(h.sql, h.sealer, { policy: OPEN_POLICY, idlePollMs: 20 });
    await vi_waitFor(() => receiver.received.length > 0);
    await loop.stop();

    expect(receiver.received).toHaveLength(1);
    const req = receiver.received[0]!;
    const bodyEvent = JSON.parse(req.rawBody) as WebhookEvent;
    expect(bodyEvent.type).toBe('contact.unsubscribed');
    expect(req.headers[WEBHOOK_EVENT_ID_HEADER]).toBe(bodyEvent.id);
    const verified = await verifyWebhook({
      secret: created.secret,
      rawBody: req.rawBody,
      signatureHeader: req.headers[WEBHOOK_SIGNATURE_HEADER] as string,
      timestampHeader: req.headers[WEBHOOK_TIMESTAMP_HEADER] as string,
    });
    expect(verified.ok).toBe(true);

    const [row] = await h.sql`SELECT status, delivered_at FROM webhook_deliveries WHERE endpoint_id = ${created.endpoint.id}`;
    expect(row!.status).toBe('succeeded');
    expect(row!.delivered_at).not.toBeNull();
  });

  it('retries on a 500, then succeeds, without exceeding one attempt per call', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.queueNext({ status: 500, body: 'boom' });

    const first = await attemptDelivery(h.sql, due, { sealer: h.sealer, policy: OPEN_POLICY });
    expect(first).toBe('retrying');
    expect(receiver.received).toHaveLength(1);
    const [afterFirst] = await h.sql`SELECT status, attempts, last_status_code, next_attempt_at FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(afterFirst).toMatchObject({ status: 'pending', attempts: 1, last_status_code: 500 });
    expect(new Date(afterFirst!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    receiver.setDefault({ status: 200 });
    const second = await attemptDelivery(h.sql, { ...due, attempts: 1 }, { sealer: h.sealer, policy: OPEN_POLICY });
    expect(second).toBe('delivered');
    const [afterSecond] = await h.sql`SELECT status, attempts FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(afterSecond).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('retries on a timeout', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.queueNext('hang');

    const result = await attemptDelivery(h.sql, due, { sealer: h.sealer, policy: OPEN_POLICY, timeoutMs: 200 });
    expect(result).toBe('retrying');
    const [row] = await h.sql`SELECT status, last_error FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(row!.status).toBe('pending');
    expect(row!.last_error).toMatch(/timed out/);
    receiver.releaseHanging();
  });

  it(`gives up after ${WEBHOOK_MAX_ATTEMPTS} attempts`, async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.setDefault({ status: 503, body: 'unavailable' });

    let last: Awaited<ReturnType<typeof attemptDelivery>> = 'retrying';
    for (let attempts = 0; attempts < WEBHOOK_MAX_ATTEMPTS; attempts++) {
      last = await attemptDelivery(h.sql, { ...due, attempts }, { sealer: h.sealer, policy: OPEN_POLICY });
    }
    expect(last).toBe('failed');
    expect(receiver.received).toHaveLength(WEBHOOK_MAX_ATTEMPTS);
    const [row] = await h.sql`SELECT status, attempts FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(row).toMatchObject({ status: 'failed', attempts: WEBHOOK_MAX_ATTEMPTS });
  });

  it('refuses to send to a private address at send time, even if the loop runs without the development flag', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    // No policy override here: the strict, production default.
    const result = await attemptDelivery(h.sql, due, { sealer: h.sealer });
    expect(result).toBe('retrying');
    expect(receiver.received).toHaveLength(0);
    const [row] = await h.sql`SELECT last_error FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(row!.last_error).toMatch(/private|loopback|link-local/);
  });

  it('backtrack: revising the endpoint to disabled stops further attempts; re-enabling resumes', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.queueNext({ status: 500 });
    expect(await attemptDelivery(h.sql, due, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('retrying');
    expect(receiver.received).toHaveLength(1);

    // The retry's backoff would run for ~30s; simulate it having elapsed.
    await h.call({ method: 'PATCH', path: `/v1/webhooks/${created.endpoint.id}`, key: W.key, body: { enabled: false } });
    await h.sql`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE id = ${due.id}`;
    const reclaimedDisabled = (await repos(h.sql).webhookDeliveries.claimDueForWorker(50, 60)).find((d) => d.id === due.id)!;
    expect(reclaimedDisabled.enabled).toBe(false);
    receiver.setDefault({ status: 200 });
    expect(await attemptDelivery(h.sql, reclaimedDisabled, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('skipped_disabled');
    // Nothing recorded, and no second request while disabled.
    expect(receiver.received).toHaveLength(1);
    const [stillPending] = await h.sql`SELECT status, attempts FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(stillPending).toMatchObject({ status: 'pending', attempts: 1 });

    await h.call({ method: 'PATCH', path: `/v1/webhooks/${created.endpoint.id}`, key: W.key, body: { enabled: true } });
    await h.sql`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE id = ${due.id}`;
    const reclaimedEnabled = (await repos(h.sql).webhookDeliveries.claimDueForWorker(50, 60)).find((d) => d.id === due.id)!;
    expect(reclaimedEnabled.enabled).toBe(true);
    expect(await attemptDelivery(h.sql, reclaimedEnabled, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('delivered');
    expect(receiver.received).toHaveLength(2);
  });

  it('resume: a delivery left mid-backoff is picked up by a fresh loop instance on schedule', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.queueNext({ status: 500 });
    await attemptDelivery(h.sql, due, { sealer: h.sealer, policy: OPEN_POLICY }); // now pending, due in 30s

    // Simulate the wait already elapsing (a real restart would just wait it out).
    await h.sql`UPDATE webhook_deliveries SET next_attempt_at = now() + interval '50 milliseconds' WHERE id = ${due.id}`;
    receiver.setDefault({ status: 200 });

    const freshLoop = startWebhookDeliveryLoop(h.sql, h.sealer, { policy: OPEN_POLICY, idlePollMs: 20 });
    await vi_waitFor(async () => {
      const [row] = await h.sql`SELECT status FROM webhook_deliveries WHERE id = ${due.id}`;
      return row!.status === 'succeeded';
    });
    await freshLoop.stop();
    // One request from the direct attemptDelivery call above (the 500), one from the fresh loop's successful retry.
    expect(receiver.received).toHaveLength(2);
    const [row] = await h.sql`SELECT status, attempts FROM webhook_deliveries WHERE id = ${due.id}`;
    expect(row).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('re-entry: a failed delivery can be redelivered manually after it gave up', async () => {
    const created = await createEndpoint();
    const due = await queueOne(created.endpoint.id);
    receiver.setDefault({ status: 500 });
    for (let attempts = 0; attempts < WEBHOOK_MAX_ATTEMPTS; attempts++) {
      await attemptDelivery(h.sql, { ...due, attempts }, { sealer: h.sealer, policy: OPEN_POLICY });
    }
    expect((await h.sql`SELECT status FROM webhook_deliveries WHERE id = ${due.id}`)[0]!.status).toBe('failed');

    const redelivered = await h.call({
      method: 'POST',
      path: `/v1/webhooks/${created.endpoint.id}/deliveries/${due.id}/redeliver`,
      key: W.key,
    });
    expect(redelivered.status).toBe(202);
    expect(redelivered.body).toMatchObject({ status: 'pending', attempts: 0 });

    receiver.setDefault({ status: 200 });
    const reclaimed = (await repos(h.sql).webhookDeliveries.claimDueForWorker(50, 60)).find((d) => d.id === due.id)!;
    expect(await attemptDelivery(h.sql, reclaimed, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('delivered');
  });

  it('concurrency: two loop instances never deliver the same delivery twice', async () => {
    const created = await createEndpoint();
    receiver.setDefault({ status: 200 });
    await emitOnly(); // unclaimed: a loop's own claimDueForWorker must find and lease it, not this helper

    const loopA = startWebhookDeliveryLoop(h.sql, h.sealer, { policy: OPEN_POLICY, idlePollMs: 20 });
    const loopB = startWebhookDeliveryLoop(h.sql, h.sealer, { policy: OPEN_POLICY, idlePollMs: 20 });
    await vi_waitFor(() => receiver.received.length > 0);
    await new Promise((r) => setTimeout(r, 100)); // let a second, wrong delivery have a chance to arrive
    await Promise.all([loopA.stop(), loopB.stop()]);

    expect(receiver.received).toHaveLength(1);
    const [row] = await h.sql`SELECT status FROM webhook_deliveries WHERE endpoint_id = ${created.endpoint.id}`;
    expect(row!.status).toBe('succeeded');
  });

  it('rotation window: both the old and the new secret verify until the window expires', async () => {
    const created = await createEndpoint();
    const rotated = await h.call({ method: 'POST', path: `/v1/webhooks/${created.endpoint.id}/rotate-secret`, key: W.key });
    expect(rotated.status).toBe(200);
    expect(rotated.body.secret).not.toBe(created.secret);

    receiver.setDefault({ status: 200 });
    const due = await queueOne(created.endpoint.id);
    expect(await attemptDelivery(h.sql, due, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('delivered');
    const req = receiver.received[0]!;
    for (const secret of [created.secret, rotated.body.secret]) {
      const verified = await verifyWebhook({
        secret,
        rawBody: req.rawBody,
        signatureHeader: req.headers[WEBHOOK_SIGNATURE_HEADER] as string,
        timestampHeader: req.headers[WEBHOOK_TIMESTAMP_HEADER] as string,
      });
      expect(verified.ok, `secret ${secret === created.secret ? 'old' : 'new'} should still verify`).toBe(true);
    }

    // Once the rotation window has passed, only the new secret verifies.
    await h.sql`UPDATE webhook_endpoints SET previous_secret_expires_at = now() - interval '1 second' WHERE id = ${created.endpoint.id}`;
    const dueAgain = await queueOne(created.endpoint.id);
    expect(await attemptDelivery(h.sql, dueAgain, { sealer: h.sealer, policy: OPEN_POLICY })).toBe('delivered');
    const req2 = receiver.received[1]!;
    const oldStillWorks = await verifyWebhook({
      secret: created.secret,
      rawBody: req2.rawBody,
      signatureHeader: req2.headers[WEBHOOK_SIGNATURE_HEADER] as string,
      timestampHeader: req2.headers[WEBHOOK_TIMESTAMP_HEADER] as string,
    });
    expect(oldStillWorks.ok).toBe(false);
  });
});

it('WEBHOOK_SECRET_ROTATION_WINDOW_MS is a full day, matching the plan', () => {
  expect(WEBHOOK_SECRET_ROTATION_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
});

/** Polls `check` until it is true (or truthy), or fails the test after ~2s. */
async function vi_waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2000;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error('vi_waitFor: condition never became true');
    await new Promise((r) => setTimeout(r, 10));
  }
}
