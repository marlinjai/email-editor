import {
  canTransition,
  EDITABLE_MAILING_STATUSES,
  type CompileMessage,
  type Mailing,
  type MailingAction,
  type MailingCounts,
  type MailingSummary,
  type MailingTestResult,
  type RecipientBatchResult,
  type TemplateDocument,
  USAGE_WARNING_HEADER,
} from '@marlinjai/mail-contract';
import { Hono, type Context } from 'hono';
import { ApiError } from '../api-error.js';
import { validateDocument } from '../documents.js';
import { actorOf, type AppEnv, type WorkspaceAccess } from '../context.js';
import type { Db, Sql } from '../db.js';
import { emitEvent } from '../events.js';
import { mount, type MountDeps } from '../mount.js';
import { repos, type Repos } from '../repo/index.js';
import type { MailingRow } from '../repo/mailings.js';
import type { RecipientRow } from '../repo/recipients.js';
import { applyStart, prepareStart } from '../platform/start-mailing.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';
import { assertCanSend, assertCanTest, assertWithinLimit, computeUsage, usageWarningHeader } from '../billing/usage.js';

/** The compiled form of a document; `errors` non-empty means it must not be sent. */
export type CompiledDocument = { mjml: string; html: string; warnings: CompileMessage[]; errors: CompileMessage[] };

export type MailingRouteDeps = MountDeps & {
  /**
   * Compiles a validated document to MJML and HTML under the workspace's
   * asset policy (src/compile/workspace-compile.ts over S1's CompilePool).
   */
  compile: (workspaceId: string, document: TemplateDocument) => Promise<CompiledDocument>;
  /** The asset policy's errors for HTML compiled earlier (a stored snapshot); empty under `any`. */
  assetErrors: (workspaceId: string, html: string) => Promise<CompileMessage[]>;
  /** Sends one test message outside the queue (src/worker/test-send.ts). */
  sendTest: (input: {
    workspaceId: string;
    mailing: MailingRow;
    html: string;
    to: string;
    merge: Record<string, unknown>;
  }) => Promise<MailingTestResult>;
  /** The current document of a saved template of the workspace, or null when there is none. */
  loadTemplateDocument: (workspaceId: string, templateId: string) => Promise<TemplateDocument | null>;
};

export function toMailingSummary(row: MailingRow, counts: MailingCounts): MailingSummary {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    preheader: row.preheader,
    template_id: row.template_id,
    topic: row.topic,
    provider_id: row.provider_id,
    status: row.status,
    counts,
    metadata: row.metadata,
    scheduled_at: row.scheduled_at,
    ab_test: row.ab_test,
    started_at: row.started_at,
    finished_at: row.finished_at,
    pause_reason: row.status === 'paused' ? row.pause_reason : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toMailing(row: MailingRow, counts: MailingCounts): Mailing {
  return { ...toMailingSummary(row, counts), document: row.document as TemplateDocument };
}

function toRecipient(row: RecipientRow) {
  return {
    id: row.id,
    mailing_id: row.mailing_id,
    contact_id: row.contact_id,
    email: row.email,
    merge: row.merge as Record<string, never>,
    status: row.status,
    skip_reason: row.skip_reason,
    attempts: row.attempts,
    message_id: row.message_id,
    last_error: row.last_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function invalidState(row: MailingRow, action: MailingAction): never {
  throw new ApiError('mailing_invalid_state', `A ${row.status} mailing cannot ${action}.`, {
    status: row.status,
    action,
  });
}

function notFound(): never {
  throw new ApiError('not_found', 'No such mailing in this workspace.');
}

async function resolveTopic(r: Repos, workspaceId: string, slug: string) {
  const topic = await r.topics.bySlug(workspaceId, slug);
  if (!topic) throw new ApiError('unknown_topic', `No topic "${slug}" in this workspace.`, { topic: slug });
  return topic;
}

async function resolveProvider(r: Repos, workspaceId: string, providerId: string) {
  const provider = /^[0-9a-f-]{36}$/i.test(providerId) ? await r.providers.get(workspaceId, providerId.toLowerCase()) : null;
  if (!provider) throw new ApiError('unknown_provider', 'No such provider in this workspace.', { provider_id: providerId });
  return provider;
}

/**
 * Mailings: the broadcast state machine of the contract's MAILING_TRANSITIONS.
 *
 * - Content, topic, provider and recipients change only while the mailing is in
 *   EDITABLE_MAILING_STATUSES (`draft`, `scheduled`); anything else is
 *   `mailing_invalid_state`, so a sent mailing is read-only.
 * - Every action takes the mailing's row lock and moves it with a
 *   compare-and-set, so two concurrent actions cannot both apply.
 * - `send` snapshots the document as it is at that moment: it compiles it,
 *   refuses a broadcast without `{{unsubscribe_url}}`, stores the compiled HTML
 *   and hands the mailing to the worker (src/worker/loop.ts).
 * - `duplicate` copies any mailing, in any state, into a new draft.
 */
export function mailingRoutes(sql: Sql, deps: MailingRouteDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  const respond = async (db: Db, workspaceId: string, row: MailingRow) =>
    toMailing(row, await repos(db).mailings.counts(workspaceId, row.id));

  const mailingId = (c: Context<AppEnv>, op: 'mailings.get') => rowId(params(c, op).id, 'mailing');

  /** S5: the soft warning once a limit is at 80 percent (`x-mail-usage-warning`). */
  const warnOnUsage = async (c: Context<AppEnv>, workspaceId: string) => {
    const header = usageWarningHeader(await computeUsage(sql, workspaceId));
    if (header) c.header(USAGE_WARNING_HEADER, header);
  };

  /** Runs `fn` with the mailing locked, in one transaction; answers the mailing afterwards. */
  async function withLocked(
    access: WorkspaceAccess,
    id: string,
    fn: (r: Repos, tx: Db, row: MailingRow) => Promise<MailingRow>,
  ): Promise<Mailing> {
    return sql.begin(async (tx) => {
      const r = repos(tx);
      const row = await r.mailings.lock(access.workspaceId, id);
      if (!row) notFound();
      const next = await fn(r, tx, row);
      return respond(tx, access.workspaceId, next);
    }) as Promise<Mailing>;
  }

  mount(app, 'mailings.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'mailings.list');
    let topicId: string | undefined;
    if (q.topic) {
      const topic = await pool.topics.bySlug(workspaceId, q.topic);
      if (!topic) return c.json({ data: [], next_cursor: null });
      topicId = topic.id;
    }
    const page = await pageArgs(q, async (id) => (await pool.mailings.get(workspaceId, id)) !== null);
    const rows = await pool.mailings.list(workspaceId, { ...page, limit: page.limit + 1, status: q.status, topicId });
    const { data, next_cursor } = toPage(rows, page.limit);
    const counts = await pool.mailings.countsFor(workspaceId, data.map((m) => m.id));
    return c.json({ data: data.map((m) => toMailingSummary(m, counts.get(m.id)!)), next_cursor });
  });

  mount(app, 'mailings.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'mailings.create');
    let document = input.document;
    let templateId: string | null = null;
    if (input.template_id !== undefined) {
      templateId = rowId(input.template_id, 'template');
      const loaded = await deps.loadTemplateDocument(access.workspaceId, templateId);
      if (!loaded) throw new ApiError('not_found', 'No such template in this workspace.');
      document = loaded;
    }
    // The editor core's full schema, not only the contract's envelope.
    const validated = validateDocument(document);
    const mailing = await sql.begin(async (tx) => {
      const r = repos(tx);
      const topic = await resolveTopic(r, access.workspaceId, input.topic);
      const provider = await resolveProvider(r, access.workspaceId, input.provider_id);
      const created = await r.mailings.create(access.workspaceId, {
        name: input.name ?? null,
        subject: input.subject,
        preheader: input.preheader ?? null,
        templateId,
        document: validated as unknown as Record<string, unknown>,
        topicId: topic.id,
        providerId: provider.id,
        metadata: input.metadata ?? {},
        createdBy: actorOf(access),
      });
      await r.audit.record(access.workspaceId, {
        action: 'mailing.created',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: created.id,
        details: { topic: topic.slug, provider_id: provider.id, template_id: templateId },
      });
      return respond(tx, access.workspaceId, created);
    });
    return c.json(mailing, 201);
  });

  mount(app, 'mailings.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const row = await pool.mailings.get(workspaceId, mailingId(c, 'mailings.get'));
    if (!row) notFound();
    return c.json(await respond(sql, workspaceId, row));
  });

  mount(app, 'mailings.update', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    const input = await body(c, 'mailings.update');
    const document = input.document === undefined ? undefined : validateDocument(input.document);
    const mailing = await withLocked(access, id, async (r, _tx, row) => {
      if (!EDITABLE_MAILING_STATUSES.includes(row.status)) {
        throw new ApiError('mailing_invalid_state', `A ${row.status} mailing can no longer be changed.`, {
          status: row.status,
        });
      }
      const topicId = input.topic === undefined ? undefined : (await resolveTopic(r, access.workspaceId, input.topic)).id;
      const providerId =
        input.provider_id === undefined ? undefined : (await resolveProvider(r, access.workspaceId, input.provider_id)).id;
      const updated = await r.mailings.updateContent(access.workspaceId, id, {
        name: input.name,
        subject: input.subject,
        preheader: input.preheader,
        document: document as unknown as Record<string, unknown> | undefined,
        topicId,
        providerId,
        metadata: input.metadata,
      });
      return updated!;
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.addRecipients', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    const input = await body(c, 'mailings.addRecipients');
    const result = await sql.begin(async (tx): Promise<RecipientBatchResult> => {
      const r = repos(tx);
      const mailing = await r.mailings.lock(access.workspaceId, id);
      if (!mailing) notFound();
      if (!EDITABLE_MAILING_STATUSES.includes(mailing.status)) {
        throw new ApiError('mailing_invalid_state', `Recipients can no longer be added to a ${mailing.status} mailing.`, {
          status: mailing.status,
        });
      }
      const rejected: RecipientBatchResult['rejected'] = [];
      const created = { count: 0 };
      const seen = new Set<string>();
      const items: Array<{ email: string; contactId: string; merge: Record<string, unknown> }> = [];
      for (const [index, item] of input.recipients.entries()) {
        const contact = await findOrCreateContact(created, r, access.workspaceId, mailing.topic_id, item);
        if (!contact) {
          rejected.push({ index, reason: 'unknown_contact' });
          continue;
        }
        if (seen.has(contact.email)) {
          rejected.push({ index, reason: 'duplicate_in_batch' });
          continue;
        }
        seen.add(contact.email);
        items.push({ email: contact.email, contactId: contact.id, merge: item.merge ?? {} });
      }
      // S5: new contacts count against the plan, checked once for the batch; a
      // batch that does not fit rolls back whole, contacts included.
      if (created.count > 0) await assertWithinLimit(tx, access.workspaceId, 'contacts');
      const { added, alreadyPresent } = await r.recipients.addMany(access.workspaceId, id, items);
      return { added: added.length, already_present: alreadyPresent.length, rejected };
    });
    return c.json(result);
  });

  mount(app, 'mailings.listRecipients', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = mailingId(c, 'mailings.get');
    const q = query(c, 'mailings.listRecipients');
    if (!(await pool.mailings.get(workspaceId, id))) notFound();
    const page = await pageArgs(q, async (rid) => (await pool.recipients.get(workspaceId, rid))?.mailing_id === id);
    const rows = await pool.recipients.list(workspaceId, id, {
      ...page,
      limit: page.limit + 1,
      status: q.status,
      skipReason: q.skip_reason,
    });
    const { data, next_cursor } = toPage(rows, page.limit);
    return c.json({ data: data.map(toRecipient), next_cursor });
  });

  mount(app, 'mailings.test', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = mailingId(c, 'mailings.get');
    const input = await body(c, 'mailings.test');
    const mailing = await pool.mailings.get(workspaceId, id);
    if (!mailing) notFound();
    // A test shows the document as it is now, even for a draft that was never compiled.
    const stored = await pool.mailings.compiled(workspaceId, id);
    let html = stored?.html ?? null;
    if (html === null) {
      const compiled = await deps.compile(workspaceId, validateDocument(mailing.document) as unknown as TemplateDocument);
      if (compiled.errors.length > 0) {
        throw new ApiError('compile_failed', 'The document does not compile.', { errors: compiled.errors });
      }
      html = compiled.html;
    } else {
      // A snapshot compiled before the workspace turned on service_only is
      // held to the policy as it is now.
      const errors = await deps.assetErrors(workspaceId, html);
      if (errors.length > 0) throw new ApiError('compile_failed', 'The document does not compile.', { errors });
    }
    const merge = { ...(input.merge ?? {}) };
    // S5: a test is one more recipient on the plan's period.
    await sql.begin((tx) => assertCanTest(tx, workspaceId));
    const result = await deps.sendTest({ workspaceId, mailing, html, to: input.to.toLowerCase(), merge });
    await warnOnUsage(c, workspaceId);
    return c.json(result);
  });

  mount(app, 'mailings.send', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    await body(c, 'mailings.send');
    const current = await pool.mailings.get(access.workspaceId, id);
    if (!current) notFound();
    if (!canTransition(current.status, 'send')) invalidState(current, 'send');
    // Compile outside the transaction (it is CPU work); the snapshot is taken
    // under the lock below and refused if the mailing changed meanwhile. The
    // same path starts a scheduled mailing at its time (src/platform/start-mailing.ts).
    const prepared = await prepareStart(deps.compile, pool, access.workspaceId, current);
    const mailing = await withLocked(access, id, async (_r, tx, row) => {
      if (!canTransition(row.status, 'send')) invalidState(row, 'send');
      return applyStart(tx, access.workspaceId, row, prepared, { trigger: 'send', actor: actorOf(access), now: new Date() });
    });
    await warnOnUsage(c, access.workspaceId);
    return c.json(mailing, 202);
  });

  mount(app, 'mailings.pause', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    await body(c, 'mailings.pause');
    const mailing = await withLocked(access, id, async (r, _tx, row) => {
      if (!canTransition(row.status, 'pause')) invalidState(row, 'pause');
      const moved = await r.mailings.transition(access.workspaceId, id, ['sending'], 'paused');
      await audit(r, access, 'mailing.paused', id);
      return moved!;
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.resume', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    await body(c, 'mailings.resume');
    const mailing = await withLocked(access, id, async (r, _tx, row) => {
      if (!canTransition(row.status, 'resume')) invalidState(row, 'resume');
      const moved = await r.mailings.transition(access.workspaceId, id, ['paused'], 'sending');
      await audit(r, access, 'mailing.resumed', id);
      return moved!;
    });
    return c.json(mailing, 202);
  });

  mount(app, 'mailings.cancel', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    await body(c, 'mailings.cancel');
    const mailing = await withLocked(access, id, async (r, tx, row) => {
      if (!canTransition(row.status, 'cancel')) invalidState(row, 'cancel');
      const moved = (await r.mailings.transition(access.workspaceId, id, [row.status], 'cancelled', {
        finishedAt: true,
      }))!;
      const skipped = await r.recipients.skipQueued(access.workspaceId, id, 'cancelled');
      await audit(r, access, 'mailing.cancelled', id, { skipped });
      // A draft that never started has nothing to report; a started one finishes here.
      if (row.status !== 'draft' && row.status !== 'scheduled') {
        await emitEvent(tx, access.workspaceId, {
          type: 'mailing.finished',
          data: {
            mailing_id: id,
            mailing_metadata: moved.metadata,
            status: 'cancelled',
            counts: await r.mailings.counts(access.workspaceId, id),
            finished_at: moved.finished_at!,
          },
        });
      }
      return moved;
    });
    return c.json(mailing);
  });

  mount(app, 'mailings.retryFailed', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    const input = await body(c, 'mailings.retryFailed');
    const mailing = await withLocked(access, id, async (r, _tx, row) => {
      if (!canTransition(row.status, 'retry-failed')) invalidState(row, 'retry-failed');
      const requeued = await r.recipients.requeueFailed(access.workspaceId, id, input.include_outcome_unknown === true);
      if (requeued === 0) {
        throw new ApiError(
          'mailing_not_ready',
          input.include_outcome_unknown
            ? 'Nothing to retry: no recipient failed or ended with an unknown outcome.'
            : 'Nothing to retry: no recipient failed. Recipients with an unknown outcome need include_outcome_unknown.',
        );
      }
      const moved = await r.mailings.transition(access.workspaceId, id, ['partially_failed'], 'sending', {
        clearFinishedAt: true,
      });
      await audit(r, access, 'mailing.retried', id, {
        requeued,
        include_outcome_unknown: input.include_outcome_unknown === true,
      });
      return moved!;
    });
    return c.json(mailing, 202);
  });

  mount(app, 'mailings.duplicate', deps, async (c) => {
    const access = c.get('access');
    const id = mailingId(c, 'mailings.get');
    await body(c, 'mailings.duplicate');
    const mailing = await sql.begin(async (tx) => {
      const r = repos(tx);
      const source = await r.mailings.get(access.workspaceId, id);
      if (!source) notFound();
      const provider = await r.providers.get(access.workspaceId, source.provider_id);
      if (!provider) {
        throw new ApiError('unknown_provider', "The mailing's provider was deleted. Duplicate it once another exists.", {
          provider_id: source.provider_id,
        });
      }
      const created = await r.mailings.create(access.workspaceId, {
        name: source.name,
        subject: source.subject,
        preheader: source.preheader,
        templateId: source.template_id,
        document: source.document,
        topicId: source.topic_id,
        providerId: source.provider_id,
        metadata: source.metadata,
        createdBy: actorOf(access),
      });
      // The A/B test's definition comes along (variants, test fraction, winner
      // metric and wait); its run does not: no winner, no decision time, no
      // results, as in any new draft. The plan and tracking checks apply again
      // when the copy starts.
      if (source.ab_test) {
        const variants = await r.mailingPlatform.variants(access.workspaceId, id);
        await r.mailingPlatform.replaceVariants(
          access.workspaceId,
          created.id,
          variants.map((v) => ({ key: v.key, subject: v.subject, document: v.document })),
        );
        await r.mailingPlatform.setAbTest(access.workspaceId, created.id, {
          variants: source.ab_test.variants,
          test_fraction: source.ab_test.test_fraction,
          winner_metric: source.ab_test.winner_metric,
          decide_after_minutes: source.ab_test.decide_after_minutes,
          status: 'pending',
          decide_at: null,
          winner: null,
          decided_by: null,
          decided_at: null,
        });
      }
      await r.audit.record(access.workspaceId, {
        action: 'mailing.created',
        actor: actorOf(access),
        targetType: 'mailing',
        targetId: created.id,
        details: { duplicated_from: id, ab_test: source.ab_test !== null },
      });
      return respond(tx, access.workspaceId, (await r.mailings.get(access.workspaceId, created.id))!);
    });
    return c.json(mailing, 201);
  });

  return app;
}

async function audit(
  r: Repos,
  access: WorkspaceAccess,
  action: 'mailing.paused' | 'mailing.resumed' | 'mailing.cancelled' | 'mailing.retried',
  id: string,
  details?: Record<string, unknown>,
) {
  await r.audit.record(access.workspaceId, { action, actor: actorOf(access), targetType: 'mailing', targetId: id, details });
}

/**
 * The contact a batch item names: by `contact_id`, else `external_id`, else
 * `email`. An email that matches no contact creates one, subscribed to the
 * mailing's topic, since the client adding a new address to a topic mailing is
 * the consent for it. An existing contact's subscriptions are never touched, so
 * a person who left the topic stays out (the worker checks at claim time).
 */
async function findOrCreateContact(
  created: { count: number },
  r: Repos,
  workspaceId: string,
  topicId: string,
  item: { contact_id?: string; external_id?: string; email?: string },
) {
  if (item.contact_id !== undefined) {
    return /^[0-9a-f-]{36}$/i.test(item.contact_id) ? r.contacts.get(workspaceId, item.contact_id.toLowerCase()) : null;
  }
  if (item.external_id !== undefined) {
    const byExternal = await r.contacts.byExternalId(workspaceId, item.external_id);
    if (byExternal) return byExternal;
    if (item.email === undefined) return null;
  }
  const email = item.email!.toLowerCase();
  const existing = await r.contacts.byEmail(workspaceId, email);
  if (existing) return existing;
  const inserted = await r.contacts.insert(workspaceId, { email, externalId: item.external_id ?? null });
  if (!inserted) return r.contacts.byEmail(workspaceId, email);
  await r.contacts.subscribe(workspaceId, inserted.id, topicId);
  created.count++;
  return inserted;
}
