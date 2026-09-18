import {
  LIST_UNSUBSCRIBE_POST_VALUE,
  UNSUBSCRIBE_PATH_PREFIX,
  type AuditActor,
  type UnsubscribeTokenClaims,
} from '@marlinjai/mail-contract';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../context.js';
import type { Db, Sql } from '../db.js';
import { emitEvent } from '../events.js';
import { chooseLocale, offeredLocales, PAGE_LOCALES, type PageLocale } from '../pages/i18n.js';
import {
  CONTENT_SECURITY_POLICY,
  maskEmail,
  renderMessage,
  renderPreferences,
  type AllState,
  type MessageKind,
  type Outcome,
  type TopicState,
  type TopicView,
} from '../pages/render.js';
import type { ContactWithTopics } from '../repo/contacts.js';
import { repos } from '../repo/index.js';
import type { SuppressionRow } from '../repo/suppressions.js';
import type { TopicRow } from '../repo/topics.js';
import type { Workspace } from '../repo/workspaces.js';
import type { UnsubscribeSigner } from '../unsubscribe.js';

/**
 * The hosted unsubscribe page, `/u/<token>`.
 *
 * - GET shows the workspace, the address partly masked, every topic with its
 *   current state, a one-step button for the topic of the mail and one for all
 *   topics. GET never writes, so link scanners and prefetchers are harmless.
 * - POST applies a choice from the page (`action`, `scope`, `topic`, `lang`
 *   form fields), or, when the body is exactly `List-Unsubscribe=One-Click`, the
 *   one-click unsubscribe of RFC 8058 (Request for Comments 8058) for the token's
 *   topic (every topic when the token names none), answered with a short 200.
 * - Every change writes the suppression, its audit row and its webhook event
 *   (`contact.unsubscribed` or `contact.resubscribed`) in one transaction. A
 *   repeated unsubscribe finds the existing block and writes nothing more, but
 *   still shows success.
 *
 * Suppressions are the service's record of the person's choice; the contact's
 * topic subscriptions are the client's and are never touched here. So an
 * unsubscribe followed by a resubscribe restores exactly the previous state.
 * Resubscribing lifts only blocks with reason `unsubscribed`: a bounce, a
 * complaint or a manual block shows as "paused by the sender" and has no button.
 *
 * Erased contacts: the token carries ids only, never the address (a link is
 * forwarded, logged and pasted; it must not disclose whose it is), and erasure
 * deletes the contact together with everything sent to it. So a token whose
 * contact is gone cannot be tied to an address any more. The page then says there
 * is nothing to change and writes nothing; that is safe, because the worker skips
 * every recipient whose contact was erased (`contact_erased`), and the
 * suppressions written before the erasure are kept.
 *
 * Test sends: F2 signs the unsubscribe link of a test mail with
 * `contact_id: TEST_UNSUBSCRIBE_CONTACT_ID`. The page renders as a preview with a
 * banner, and every POST, one-click included, succeeds without writing anything.
 */

export const TEST_UNSUBSCRIBE_CONTACT_ID = 'test';

/** Form posts are a few fields; anything larger is not from this page. */
const MAX_BODY_BYTES = 16 * 1024;
/** More topics than any honest workspace has; the page lists at most these. */
const MAX_TOPICS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR: AuditActor = { type: 'system', reason: 'hosted unsubscribe page' };
const SERIALIZATION_RETRIES = 3;

export type UnsubscribeRouteDeps = {
  signer: UnsubscribeSigner;
  /** The event writer; replaceable so a test can prove the change and its event roll back together. */
  emit?: typeof emitEvent;
  log?: Pick<Console, 'error'>;
};

type Source = 'hosted_page' | 'one_click';

type Resolved =
  | { kind: 'invalid' }
  | { kind: 'gone'; workspace: Workspace }
  | {
      kind: 'ok';
      claims: UnsubscribeTokenClaims;
      workspace: Workspace;
      /** Null for a test send's preview. */
      contact: ContactWithTopics | null;
      mailTopic: TopicRow | null;
    };

type PreferenceState = {
  topics: TopicRow[];
  suppressions: SuppressionRow[];
};

class PageError extends Error {
  constructor(
    readonly kind: MessageKind,
    readonly status: 400 | 403 | 500,
  ) {
    super(kind);
  }
}

function isSerializationFailure(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '40001';
}

export function unsubscribeRoutes(sql: Sql, deps: UnsubscribeRouteDeps) {
  const app = new Hono<AppEnv>();
  const emit = deps.emit ?? emitEvent;
  const log = deps.log ?? console;
  const pool = repos(sql);
  const path = `${UNSUBSCRIBE_PATH_PREFIX}:token`;

  app.use(
    `${UNSUBSCRIBE_PATH_PREFIX}*`,
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => respond(c, 413, renderMessage({ kind: 'invalid', locale: 'en', offered: PAGE_LOCALES })),
    }),
  );

  /** Verifies the token and loads what it names, all scoped to the token's workspace. */
  async function resolve(token: string): Promise<Resolved> {
    const claims = deps.signer.verify(token);
    if (!claims) return { kind: 'invalid' };
    const isTest = claims.contact_id === TEST_UNSUBSCRIBE_CONTACT_ID;
    const ids = [claims.workspace_id, claims.topic_id, claims.mailing_id, isTest ? null : claims.contact_id];
    if (ids.some((id) => id !== null && !UUID.test(id))) return { kind: 'invalid' };

    const workspace = await pool.workspaces.get(claims.workspace_id);
    if (!workspace) return { kind: 'invalid' };
    // A topic of another workspace is not found in this one: the token does not
    // belong together and is refused, the same as a tampered one.
    const mailTopic = claims.topic_id ? await pool.topics.get(workspace.id, claims.topic_id) : null;
    if (claims.topic_id && !mailTopic) return { kind: 'invalid' };
    if (isTest) return { kind: 'ok', claims, workspace, contact: null, mailTopic };

    const contact = await pool.contacts.get(workspace.id, claims.contact_id);
    if (!contact) return { kind: 'gone', workspace };
    return { kind: 'ok', claims, workspace, contact, mailTopic };
  }

  async function loadState(db: Db, workspaceId: string, email: string | null): Promise<PreferenceState> {
    const r = repos(db);
    const topics: TopicRow[] = [];
    let afterId: string | undefined;
    while (topics.length < MAX_TOPICS) {
      const batch = await r.topics.list(workspaceId, { afterId, limit: 100 });
      topics.push(...batch);
      if (batch.length < 100) break;
      afterId = batch[batch.length - 1]!.id;
    }
    const suppressions = email ? await r.suppressions.list(workspaceId, { email, limit: MAX_TOPICS + 1 }) : [];
    return { topics: topics.slice(0, MAX_TOPICS), suppressions };
  }

  function localeFor(c: Context<AppEnv>, workspace: Workspace | null, contact: ContactWithTopics | null, explicit?: string) {
    const offered = workspace ? offeredLocales(workspace.settings) : [...PAGE_LOCALES];
    const locale = chooseLocale({
      offered,
      explicit: explicit ?? c.req.query('lang'),
      acceptLanguage: c.req.header('accept-language'),
      contactLocale: contact?.locale,
    });
    return { locale, offered };
  }

  function message(c: Context<AppEnv>, status: number, kind: MessageKind, workspace: Workspace | null, explicit?: string) {
    const { locale, offered } = localeFor(c, workspace, null, explicit);
    return respond(c, status, renderMessage({ kind, locale, offered }));
  }

  function preferences(
    c: Context<AppEnv>,
    resolved: Extract<Resolved, { kind: 'ok' }>,
    state: PreferenceState,
    token: string,
    outcome?: Outcome,
    explicit?: string,
  ) {
    const { workspace, contact } = resolved;
    const { locale, offered } = localeFor(c, workspace, contact, explicit);
    const view = buildView(locale, resolved, state);
    const html = renderPreferences({
      locale,
      offered,
      path: `${UNSUBSCRIBE_PATH_PREFIX}${token}`,
      workspaceName: workspace.name,
      maskedEmail: contact ? maskEmail(contact.email) : null,
      mailTopic: view.mailTopic,
      topics: view.topics,
      all: view.all,
      isTest: contact === null,
      outcome: outcome ? view.outcomeWithNames(outcome) : undefined,
    });
    return respond(c, 200, html);
  }

  /** Runs a handler and turns any failure into a page, never a JSON error or a stack trace. */
  function page(handler: (c: Context<AppEnv>) => Promise<Response>) {
    return async (c: Context<AppEnv>) => {
      try {
        return await handler(c);
      } catch (err) {
        if (err instanceof PageError) return message(c, err.status, err.kind, null);
        log.error(`[${c.get('requestId')}] ${c.req.method} ${UNSUBSCRIBE_PATH_PREFIX}<token> failed:`, err);
        return message(c, 500, 'error', null);
      }
    };
  }

  app.get(
    path,
    page(async (c) => {
      const token = c.req.param('token') ?? '';
      const resolved = await resolve(token);
      if (resolved.kind === 'invalid') return message(c, 400, 'invalid', null);
      if (resolved.kind === 'gone') return message(c, 200, 'gone', resolved.workspace);
      const state = await loadState(sql, resolved.workspace.id, resolved.contact?.email ?? null);
      return preferences(c, resolved, state, token);
    }),
  );

  app.post(
    path,
    page(async (c) => {
      // Cross-site request forgery (CSRF) is not the threat here: the token in
      // the path is the whole credential, so a forged request needs the token and
      // anyone holding it can post it directly. The Origin check is defence in
      // depth only: it stops a naive cross-site form post that names its own
      // origin. It must tolerate an absent Origin, because the mail client's
      // one-click POST (RFC 8058) is a server-side request that sends none, and
      // the literal "null", which a browser sends for this page's own form under
      // `Referrer-Policy: no-referrer` (Fetch standard, "serializing a request
      // origin") and privacy tooling sends too. A deliberate attacker page can
      // also arrive as "null", so this is not a real barrier; it does not need to
      // be, since the token is the credential. Refusing absent or "null" origins
      // would block the unsubscribe the law requires us to honour.
      if (isForeignOrigin(c)) return message(c, 403, 'cross_site', null);

      const token = c.req.param('token') ?? '';
      const form = await readForm(c);
      const oneClick = isOneClick(form);
      const resolved = await resolve(token);

      if (oneClick) {
        // Mail clients read the status, not the body: 200 for a genuine token,
        // whatever was (or was not) left to change.
        if (resolved.kind === 'invalid') return c.text('Invalid unsubscribe link.', 400, securityHeaders(true));
        if (resolved.kind === 'ok' && resolved.contact) {
          await change(resolved, { action: 'unsubscribe', topic: resolved.mailTopic, source: 'one_click' });
        }
        return c.text('Unsubscribed.', 200, securityHeaders(true));
      }

      const explicit = typeof form.lang === 'string' ? form.lang : undefined;
      if (resolved.kind === 'invalid') return message(c, 400, 'invalid', null, explicit);
      if (resolved.kind === 'gone') return message(c, 200, 'gone', resolved.workspace, explicit);

      const choice = parseChoice(form);
      if (!choice) return message(c, 400, 'invalid', resolved.workspace, explicit);
      let topic: TopicRow | null = null;
      if (choice.scope === 'topic') {
        topic = await pool.topics.get(resolved.workspace.id, choice.topicId);
        if (!topic) return message(c, 400, 'invalid', resolved.workspace, explicit);
      }

      if (!resolved.contact) {
        const state = await loadState(sql, resolved.workspace.id, null);
        return preferences(c, resolved, state, token, { kind: 'test' }, explicit);
      }
      const changed = await change(resolved, { action: choice.action, topic, source: 'hosted_page' });
      const state = await loadState(sql, resolved.workspace.id, resolved.contact.email);
      // A repeated unsubscribe still confirms (the person is unsubscribed). A
      // resubscribe that lifted nothing (a bounce or manual block landed after
      // the page was opened, or nothing was blocked) must not claim success:
      // the plain page shows the true state instead.
      if (!changed && choice.action === 'resubscribe') return preferences(c, resolved, state, token, undefined, explicit);
      const outcome: Outcome = {
        kind: choice.action === 'unsubscribe' ? 'unsubscribed' : 'resubscribed',
        topic: topic ? { id: topic.id, name: topic.name, description: topic.description, state: 'subscribed' } : null,
      };
      return preferences(c, resolved, state, token, outcome, explicit);
    }),
  );

  /**
   * Applies one choice in a serializable transaction, retried on a
   * serialization failure, so two concurrent clicks (a double submit, the mail
   * client's one-click racing the page) cannot interleave into a state neither
   * asked for. Returns whether anything changed.
   */
  async function change(
    resolved: Extract<Resolved, { kind: 'ok' }>,
    input: { action: 'unsubscribe' | 'resubscribe'; topic: TopicRow | null; source: Source },
  ): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await sql.begin('isolation level serializable', (tx) => applyChange(tx, resolved, input))) as boolean;
      } catch (err) {
        if (attempt < SERIALIZATION_RETRIES && isSerializationFailure(err)) continue;
        throw err;
      }
    }
  }

  async function applyChange(
    tx: Db,
    resolved: Extract<Resolved, { kind: 'ok' }>,
    input: { action: 'unsubscribe' | 'resubscribe'; topic: TopicRow | null; source: Source },
  ): Promise<boolean> {
    const contact = resolved.contact!;
    const ws = resolved.workspace.id;
    const r = repos(tx);
    const base = {
      contact_id: contact.id,
      external_id: contact.external_id,
      email: contact.email,
      topic: input.topic?.slug ?? null,
      mailing_id: resolved.claims.mailing_id,
      source: input.source,
    };
    const details = {
      topic: input.topic?.slug ?? null,
      scope: input.topic ? 'topic' : 'all',
      source: input.source,
      mailing_id: resolved.claims.mailing_id,
    };

    if (input.action === 'unsubscribe') {
      const { suppression, created } = await r.suppressions.create(ws, {
        email: contact.email,
        reason: 'unsubscribed',
        topicId: input.topic?.id ?? null,
      });
      if (!created) return false;
      await r.audit.record(ws, {
        action: 'contact.unsubscribed',
        actor: ACTOR,
        targetType: 'contact',
        targetId: contact.id,
        details: { ...details, suppression_id: suppression.id },
      });
      await emit(tx, ws, { type: 'contact.unsubscribed', data: { ...base, unsubscribed_at: suppression.created_at } });
      return true;
    }

    // Resubscribe.
    const { topics, suppressions } = await loadState(tx, ws, contact.email);
    const allBlock = suppressions.find((s) => s.topic_id === null) ?? null;
    const lifted: string[] = [];
    const split: string[] = [];

    if (!input.topic) {
      if (allBlock?.reason !== 'unsubscribed') return false;
      await r.suppressions.delete(ws, allBlock.id);
      lifted.push(allBlock.id);
    } else {
      const own = suppressions.find((s) => s.topic_id === input.topic!.id) ?? null;
      if (own && own.reason !== 'unsubscribed') return false;
      if (allBlock && allBlock.reason !== 'unsubscribed') return false;
      if (!own && !allBlock) return false;
      if (allBlock) {
        // Opting back into one topic while every topic is blocked: the block on
        // everything becomes a block on every other topic, so nothing else
        // starts arriving.
        await r.suppressions.delete(ws, allBlock.id);
        lifted.push(allBlock.id);
        const blocked = new Set(suppressions.map((s) => s.topic_id));
        for (const other of topics) {
          if (other.id === input.topic.id || blocked.has(other.id)) continue;
          const { suppression } = await r.suppressions.create(ws, {
            email: contact.email,
            reason: 'unsubscribed',
            topicId: other.id,
            note: 'Kept from an all-topics unsubscribe when one topic was resubscribed on the hosted page.',
          });
          split.push(suppression.id);
        }
      }
      if (own) {
        await r.suppressions.delete(ws, own.id);
        lifted.push(own.id);
      }
    }

    await r.audit.record(ws, {
      action: 'suppression.deleted',
      actor: ACTOR,
      targetType: 'contact',
      targetId: contact.id,
      details: { ...details, resubscribed: true, lifted_suppression_ids: lifted, created_suppression_ids: split },
    });
    await emit(tx, ws, { type: 'contact.resubscribed', data: { ...base, resubscribed_at: new Date().toISOString() } });
    return true;
  }

  function buildView(locale: PageLocale, resolved: Extract<Resolved, { kind: 'ok' }>, state: PreferenceState) {
    const { contact } = resolved;
    const allBlock = state.suppressions.find((s) => s.topic_id === null) ?? null;
    const all: AllState = !allBlock ? 'open' : allBlock.reason === 'unsubscribed' ? 'unsubscribed' : 'paused';
    const subscribed = new Set(contact?.topics ?? []);

    const stateOf = (topic: TopicRow): TopicState => {
      // A preview shows the page as a subscriber would see it.
      if (!contact) return 'subscribed';
      const own = state.suppressions.find((s) => s.topic_id === topic.id);
      if ((own && own.reason !== 'unsubscribed') || all === 'paused') return 'paused';
      if (own || all === 'unsubscribed') return 'unsubscribed';
      return subscribed.has(topic.slug) ? 'subscribed' : 'not_subscribed';
    };
    const view = (topic: TopicRow): TopicView => {
      const translated = topic.translations[locale];
      return {
        id: topic.id,
        name: translated?.name || topic.name,
        description: translated?.description ?? topic.description,
        state: stateOf(topic),
      };
    };
    const topics = state.topics.map(view);
    const mailTopic = resolved.mailTopic ? view(resolved.mailTopic) : null;
    return {
      all,
      topics,
      mailTopic,
      /** The outcome with the topic named in the page's language. */
      outcomeWithNames(outcome: Outcome): Outcome {
        if (outcome.kind === 'test' || !outcome.topic) return outcome;
        return { ...outcome, topic: topics.find((t) => t.id === outcome.topic!.id) ?? outcome.topic };
      },
    };
  }

  return app;
}

function securityHeaders(plain = false): Record<string, string> {
  return {
    'content-security-policy': plain ? "default-src 'none'; frame-ancestors 'none'" : CONTENT_SECURITY_POLICY,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function respond(c: Context<AppEnv>, status: number, html: string): Response {
  return c.html(html, status as 200, securityHeaders());
}

function isForeignOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header('origin');
  if (!origin || origin === 'null') return false;
  // Behind the proxy the public host arrives as X-Forwarded-Host; a browser
  // cannot set that header on a cross-site form post, so trusting it here cannot
  // let a foreign page pass.
  const host = c.req.header('x-forwarded-host')?.split(',')[0]?.trim() || c.req.header('host');
  try {
    return !host || new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}

type Form = Record<string, string | File | (string | File)[]>;

async function readForm(c: Context<AppEnv>): Promise<Form> {
  const type = c.req.header('content-type') ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) return {};
  try {
    return (await c.req.parseBody({ all: true })) as Form;
  } catch {
    throw new PageError('invalid', 400);
  }
}

/** RFC 8058: the body is `List-Unsubscribe=One-Click` and nothing else. */
function isOneClick(form: Form): boolean {
  const [name, value] = LIST_UNSUBSCRIBE_POST_VALUE.split('=') as [string, string];
  const keys = Object.keys(form);
  return keys.length === 1 && keys[0] === name && form[name] === value;
}

type Choice =
  | { action: 'unsubscribe' | 'resubscribe'; scope: 'all' }
  | { action: 'unsubscribe' | 'resubscribe'; scope: 'topic'; topicId: string };

function parseChoice(form: Form): Choice | null {
  const { action, scope, topic } = form;
  if (action !== 'unsubscribe' && action !== 'resubscribe') return null;
  if (scope === 'all') return { action, scope };
  if (scope === 'topic' && typeof topic === 'string' && UUID.test(topic)) return { action, scope, topicId: topic };
  return null;
}
