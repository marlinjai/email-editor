import type { ProviderPolicy } from '@marlinjai/mail-contract';
import { repos } from '../../src/repo/index.js';
import { createSealer } from '../../src/sealing.js';
import { MemoryTransport } from '../../src/transport/index.js';
import { SendWorker, type SendWorkerOptions } from '../../src/worker/loop.js';
import { SECRETS_KEYS, type Harness } from './harness.js';
import { newsletter } from './mail-documents.js';

/**
 * Seeds what the provider, topic and contact routes (another team's) would
 * create, straight through the repositories, so these tests stand alone.
 */
export async function seedSending(
  h: Harness,
  workspaceId: string,
  opts: { policy?: Partial<ProviderPolicy>; topic?: string } = {},
) {
  const r = repos(h.sql);
  const topic = (await r.topics.create(workspaceId, {
    slug: opts.topic ?? 'news',
    name: 'News',
    description: null,
    translations: {},
  }))!;
  const provider = await r.providers.create(workspaceId, {
    kind: 'smtp',
    name: 'Test SMTP',
    config: { host: 'smtp.example.test', port: 465, security: 'tls', username: 'sender' },
    secretSealed: createSealer(SECRETS_KEYS).seal('not-a-real-password'),
    fromName: 'Studio',
    fromEmail: 'news@studio.test',
    replyTo: 'hello@studio.test',
    policy: { daily_recipient_budget: 1000, min_interval_ms: 0, max_recipients_per_message: 1, ...opts.policy },
  });
  return { topic, provider };
}

/** A contact subscribed to the topic (unless `subscribed: false`). */
export async function seedContact(
  h: Harness,
  workspaceId: string,
  topicId: string,
  c: { email: string; first_name?: string; external_id?: string; properties?: Record<string, unknown>; subscribed?: boolean },
) {
  const r = repos(h.sql);
  const contact = (await r.contacts.insert(workspaceId, {
    email: c.email,
    firstName: c.first_name ?? null,
    externalId: c.external_id ?? null,
    properties: c.properties ?? {},
  }))!;
  if (c.subscribed !== false) await r.contacts.subscribe(workspaceId, contact.id, topicId);
  return contact;
}

type W = { id: string; key: string };

/** A draft over the API. */
export async function createMailing(
  h: Harness,
  w: W,
  input: { topic: string; provider_id: string; document?: unknown; subject?: string; metadata?: Record<string, string> },
) {
  const res = await h.call({
    method: 'POST',
    path: '/v1/mailings',
    key: w.key,
    body: {
      subject: input.subject ?? 'News for {{first_name|you}}',
      topic: input.topic,
      provider_id: input.provider_id,
      document: input.document ?? newsletter(),
      metadata: input.metadata ?? { kind: 'newsletter' },
    },
  });
  if (res.status !== 201) throw new Error(`create mailing: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string } & Record<string, any>;
}

export async function addRecipients(h: Harness, w: W, mailingId: string, recipients: unknown[]) {
  return h.call({ method: 'POST', path: `/v1/mailings/${mailingId}/recipients`, key: w.key, body: { recipients } });
}

export async function action(h: Harness, w: W, mailingId: string, name: string, body: unknown = {}) {
  return h.call({ method: 'POST', path: `/v1/mailings/${mailingId}/${name}`, key: w.key, body });
}

/** A worker over the harness database, fast settings, the given transport. */
export function makeWorker(h: Harness, transport: MemoryTransport = h.transport, over: Partial<SendWorkerOptions> = {}) {
  return new SendWorker({
    sql: h.sql,
    transportFor: () => transport,
    signer: h.signer,
    retryDelaysMs: [0, 0, 0],
    pollMs: 10,
    sendTimeoutMs: 2_000,
    stuckAfterMs: 5_000,
    log: { error: () => {}, log: () => {} },
    ...over,
  });
}

/**
 * Drains until no recipient of the mailing is still queued. A retry scheduled
 * "now" (the 0 ms delays above) is stamped on this process's clock and compared
 * on the database's, which can lag by a few milliseconds, so one drain may find
 * it not yet due and return.
 */
export async function drainUntilSettled(h: Harness, worker: SendWorker, workspaceId: string, mailingId: string, maxRounds = 100) {
  for (let round = 0; round < maxRounds; round++) {
    await worker.drain();
    const rows = await recipientsOf(h, workspaceId, mailingId);
    if (!rows.some((r) => r.status === 'queued' || r.status === 'sending')) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`mailing ${mailingId} still has queued recipients after ${maxRounds} drains`);
}

export async function recipientsOf(h: Harness, workspaceId: string, mailingId: string) {
  return repos(h.sql).recipients.list(workspaceId, mailingId, { limit: 1000 });
}

export async function eventsOf(h: Harness, workspaceId: string, type?: string) {
  const rows = await h.sql<{ type: string; payload: any }[]>`
    SELECT type, payload FROM webhook_events WHERE workspace_id = ${workspaceId}
    ${type ? h.sql`AND type = ${type}` : h.sql``}
    ORDER BY created_at, id`;
  return rows;
}

export async function mailingStatus(h: Harness, workspaceId: string, mailingId: string) {
  return (await repos(h.sql).mailings.get(workspaceId, mailingId))!.status;
}
