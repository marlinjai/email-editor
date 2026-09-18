import { assertWithinLimit } from '../billing/usage.js';
import { ApiError } from '../api-error.js';
import type { AuditActor } from '@marlinjai/mail-contract';
import type { Db, Sql } from '../db.js';
import { emitEvent } from '../events.js';
import { chooseLocale, offeredLocales, type PageLocale } from '../pages/i18n.js';
import { createAddressHasher, createPurposeSigner, type RootKeys } from '../platform/tokens.js';
import { repos } from '../repo/index.js';
import type { SignupFormRow, SignupSubmissionRow } from '../repo/signup.js';
import type { TopicRow } from '../repo/topics.js';
import type { Workspace } from '../repo/workspaces.js';

/**
 * Double opt-in for the hosted signup forms: what a submission does, and what
 * following the confirmation link does. Shared by the hosted page (`/f/<id>`),
 * the JSON route (`signupForms.submit`) and the confirmation page
 * (`/f/confirm/<token>`).
 *
 * Rules:
 * - Nothing about the person reaches contacts before confirmation: a submission
 *   is a `signup_submissions` row, and its confirmation mail goes through the
 *   outbox (src/signup/mail-job.ts).
 * - Every submission that passes the bot checks gets the same answer, whether
 *   the address is new, already subscribed or blocked, so a form never
 *   discloses who is on a list.
 * - Bot checks: the honeypot must be empty; the form token (signed render time)
 *   must be at least `minFillMs` and at most `maxTokenAgeMs` old; the rate limits
 *   per client address and per workspace hold in Postgres.
 * - Confirming lifts only `unsubscribed` blocks, and only for the form's topics:
 *   an all-topics unsubscribe becomes a per-topic unsubscribe for every other
 *   topic, so the person gets exactly what they consented to. Bounced,
 *   complained and manual blocks are never lifted here.
 */

export type SignupOptions = {
  now?: () => Date;
  /** A human needs at least this long to fill the form. */
  minFillMs?: number;
  /** A form token older than this is stale (a page left open overnight gets a fresh one). */
  maxTokenAgeMs?: number;
  /** How long a confirmation link works. */
  confirmValidMs?: number;
  /** Accepted submissions per client address and workspace per window. */
  ipLimit?: number;
  ipWindowMs?: number;
  /** Accepted submissions per workspace per window. */
  workspaceLimit?: number;
  workspaceWindowMs?: number;
};

export const SIGNUP_DEFAULTS = {
  minFillMs: 3_000,
  maxTokenAgeMs: 24 * 60 * 60 * 1000,
  confirmValidMs: 72 * 60 * 60 * 1000,
  ipLimit: 5,
  ipWindowMs: 10 * 60 * 1000,
  workspaceLimit: 300,
  workspaceWindowMs: 60 * 60 * 1000,
} as const;

export type SubmissionInput = {
  email: string;
  first_name?: string;
  last_name?: string;
  /** The honeypot. */
  website?: string;
  form_token?: string;
  /** The language the person saw (the page's) or asked for (the JSON body's). */
  locale?: string;
};

export type SubmitOutcome =
  /** A confirmation mail is queued. */
  | 'accepted'
  /** Nothing to do (already subscribed, or blocked for good); the caller answers as for `accepted`. */
  | 'noop'
  /** A bot check failed silently (honeypot); the caller answers as for `accepted`. */
  | 'ignored'
  /** No valid, fresh form token: a human confirms with one more click. */
  | 'needs_token'
  | 'rate_limited';

export type ConfirmState =
  | { kind: 'invalid' }
  | { kind: 'gone'; workspace: Workspace | null }
  | { kind: 'expired'; workspace: Workspace; form: SignupFormRow }
  | { kind: 'superseded'; workspace: Workspace; form: SignupFormRow }
  | { kind: 'already'; workspace: Workspace; form: SignupFormRow; submission: SignupSubmissionRow }
  | { kind: 'open'; workspace: Workspace; form: SignupFormRow; submission: SignupSubmissionRow };

export type ConfirmOutcome =
  | Exclude<ConfirmState, { kind: 'open' }>
  | { kind: 'confirmed'; workspace: Workspace; form: SignupFormRow; paused: boolean; changed: boolean }
  /** The workspace's plan has no room for another contact (S5): nothing was written, the link stays valid. */
  | { kind: 'full'; workspace: Workspace };

/** Carries the workspace out of a rolled-back confirmation that hit the plan's contact limit. */
class PlanFull extends Error {
  constructor(readonly workspace: Workspace) {
    super('plan_limit_reached');
  }
}

const ACTOR: AuditActor = { type: 'system', reason: 'hosted signup form (double opt-in)' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERIALIZATION_RETRIES = 3;
/** More topics than any honest workspace has. */
const MAX_TOPICS = 1000;

function isSerializationFailure(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '40001';
}

export type SignupService = ReturnType<typeof createSignupService>;

export function createSignupService(deps: { sql: Sql; keys: RootKeys; options?: SignupOptions; log?: Pick<Console, 'log'> }) {
  const { sql } = deps;
  const o = { ...SIGNUP_DEFAULTS, ...(deps.options ?? {}) };
  const now = deps.options?.now ?? (() => new Date());
  const log = deps.log ?? console;
  const renderSigner = createPurposeSigner(deps.keys, 'signup-render');
  const confirmSigner = createPurposeSigner(deps.keys, 'signup-confirm');
  const hashAddress = createAddressHasher(deps.keys);

  /** A fresh form token: the form it is for and when it was issued. */
  function formToken(formId: string, issuedAt: Date = now()): string {
    return renderSigner.sign(`${formId}.${issuedAt.getTime()}`);
  }

  function checkFormToken(formId: string, token: string | undefined): 'ok' | 'too_fast' | 'stale' | 'invalid' {
    if (!token) return 'invalid';
    const payload = renderSigner.verify(token);
    const m = payload ? /^([0-9a-f-]{36})\.(\d{1,15})$/.exec(payload) : null;
    if (!m || m[1] !== formId) return 'invalid';
    const age = now().getTime() - Number(m[2]);
    if (age < o.minFillMs) return 'too_fast';
    if (age > o.maxTokenAgeMs) return 'stale';
    return 'ok';
  }

  function confirmToken(submission: Pick<SignupSubmissionRow, 'id' | 'expires_at'>): string {
    return confirmSigner.sign(`${submission.id}.${new Date(submission.expires_at).getTime()}`);
  }

  function readConfirmToken(token: string): { submissionId: string } | null {
    const payload = confirmSigner.verify(token);
    const m = payload ? /^([0-9a-f-]{36})\.(\d{1,15})$/.exec(payload) : null;
    return m && UUID.test(m[1]!) ? { submissionId: m[1]! } : null;
  }

  function localeOf(workspace: Workspace, explicit: string | undefined, acceptLanguage?: string): PageLocale {
    return chooseLocale({ offered: offeredLocales(workspace.settings), explicit, acceptLanguage });
  }

  /**
   * One submission, after the caller validated its shape. `ip` is the client
   * address as the edge saw it; only its keyed hash is used or stored.
   */
  async function submit(form: SignupFormRow, input: SubmissionInput, ip: string, acceptLanguage?: string): Promise<SubmitOutcome> {
    if (input.website !== undefined && input.website !== '') {
      log.log(`[signup] form ${form.id}: honeypot filled, submission ignored`);
      return 'ignored';
    }
    const check = checkFormToken(form.id, input.form_token);
    if (check !== 'ok') {
      log.log(`[signup] form ${form.id}: form token ${check}, asking for one more click`);
      return 'needs_token';
    }
    const ipHash = hashAddress(ip);
    const email = input.email.trim().toLowerCase();
    const ws = form.workspace_id;

    return (await sql.begin(async (tx) => {
      const r = repos(tx);
      const workspace = await r.workspaces.get(ws);
      if (!workspace) return 'noop';
      const perIp = await r.signup.hit(ws, 'ip', ipHash, o.ipWindowMs);
      const perWorkspace = await r.signup.hit(ws, 'workspace', '', o.workspaceWindowMs);
      if (perIp > o.ipLimit || perWorkspace > o.workspaceLimit) {
        log.log(`[signup] form ${form.id}: rate limit reached (${perIp > o.ipLimit ? 'address' : 'workspace'})`);
        return 'rate_limited';
      }
      if (await nothingToGain(tx, ws, form, email)) return 'noop';

      const locale = localeOf(workspace, input.locale, acceptLanguage);
      const consentText = form.translations[locale]?.consent_text ?? form.consent_text;
      await r.signup.createSubmission(ws, {
        formId: form.id,
        formVersion: form.version,
        email,
        firstName: input.first_name?.trim() || null,
        lastName: input.last_name?.trim() || null,
        locale,
        consentText,
        ipHash,
        validForMs: o.confirmValidMs,
      });
      return 'accepted';
    })) as SubmitOutcome;
  }

  /**
   * True when confirming could change nothing: every form topic is already
   * subscribed without a block, or blocked by something a signup never lifts.
   * Then no confirmation mail is sent at all.
   */
  async function nothingToGain(tx: Db, ws: string, form: SignupFormRow, email: string): Promise<boolean> {
    const r = repos(tx);
    const contact = await r.contacts.byEmail(ws, email);
    const topics = await r.topics.bySlugs(ws, form.topics);
    const blocks = await r.suppressions.list(ws, { email, limit: MAX_TOPICS + 1 });
    const all = blocks.find((b) => b.topic_id === null) ?? null;
    return topics.every((topic) => {
      const own = blocks.find((b) => b.topic_id === topic.id) ?? null;
      if ((all && all.reason !== 'unsubscribed') || (own && own.reason !== 'unsubscribed')) return true;
      return !all && !own && contact !== null && contact.topics.includes(topic.slug);
    });
  }

  /** Where a confirmation link stands, without changing anything (the GET of the page). */
  async function inspect(token: string, db: Db = sql, lock = false): Promise<ConfirmState> {
    const claims = readConfirmToken(token);
    if (!claims) return { kind: 'invalid' };
    const found = await repos(db).signup.findSubmissionForPublic(claims.submissionId);
    if (!found) return { kind: 'invalid' };
    const r = repos(db);
    const submission = lock ? await r.signup.lockSubmission(found.workspace_id, found.id) : found;
    if (!submission) return { kind: 'invalid' };
    const workspace = await r.workspaces.get(submission.workspace_id);
    if (!workspace) return { kind: 'invalid' };
    const form = await r.signup.getFormAnyState(workspace.id, submission.form_id);
    if (!form || form.deleted_at) return { kind: 'gone', workspace };
    if (submission.confirmed_at) return { kind: 'already', workspace, form, submission };
    if (submission.superseded_at) return { kind: 'superseded', workspace, form };
    if (new Date(submission.expires_at).getTime() <= now().getTime()) return { kind: 'expired', workspace, form };
    return { kind: 'open', workspace, form, submission };
  }

  /** Follows the confirmation link (the POST of the page), in one serializable transaction. */
  async function confirm(token: string, ip: string): Promise<ConfirmOutcome> {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await sql.begin('isolation level serializable', async (tx) => {
          const state = await inspect(token, tx, true);
          if (state.kind !== 'open') return state;
          try {
            return await apply(tx, state, hashAddress(ip));
          } catch (err) {
            if (err instanceof ApiError && err.code === 'plan_limit_reached') throw new PlanFull(state.workspace);
            throw err;
          }
        })) as ConfirmOutcome;
      } catch (err) {
        if (err instanceof PlanFull) return { kind: 'full', workspace: err.workspace };
        if (attempt < SERIALIZATION_RETRIES && isSerializationFailure(err)) continue;
        throw err;
      }
    }
  }

  async function apply(
    tx: Db,
    state: Extract<ConfirmState, { kind: 'open' }>,
    confirmedIpHash: string,
  ): Promise<ConfirmOutcome> {
    const { workspace, form, submission } = state;
    const ws = workspace.id;
    const r = repos(tx);

    // The contact: created now, or completed where it has no name or locale yet.
    let contact = await r.contacts.byEmail(ws, submission.email);
    let created = false;
    if (!contact) {
      const inserted = await r.contacts.insert(ws, {
        email: submission.email,
        firstName: submission.first_name,
        lastName: submission.last_name,
        locale: submission.locale,
      });
      created = inserted !== null;
      // S5: a new contact must fit the plan; over it, the whole confirmation rolls back.
      if (created) await assertWithinLimit(tx, ws, 'contacts');
      contact = await r.contacts.byEmail(ws, submission.email);
      if (!contact) throw new Error(`contact ${submission.email} vanished while confirming a signup`);
    } else {
      const patch = {
        firstName: contact.first_name === null && submission.first_name ? submission.first_name : undefined,
        lastName: contact.last_name === null && submission.last_name ? submission.last_name : undefined,
        locale: contact.locale === null ? submission.locale : undefined,
      };
      if (patch.firstName !== undefined || patch.lastName !== undefined || patch.locale !== undefined) {
        await r.contacts.update(ws, contact.id, patch);
      }
    }

    const formTopics = await r.topics.bySlugs(ws, form.topics);
    const blocks = await r.suppressions.list(ws, { email: submission.email, limit: MAX_TOPICS + 1 });
    const all = blocks.find((b) => b.topic_id === null) ?? null;
    const lifted: string[] = [];
    const split: string[] = [];
    const resubscribed: TopicRow[] = [];
    const subscribed: TopicRow[] = [];
    const paused: TopicRow[] = [];
    const gained: TopicRow[] = [];

    // An all-topics unsubscribe: it becomes an unsubscribe of every topic the
    // form does not name, so only what the person just consented to opens up.
    let allLifted = false;
    if (all?.reason === 'unsubscribed') {
      const formIds = new Set(formTopics.map((t) => t.id));
      const blockedIds = new Set(blocks.map((b) => b.topic_id));
      await r.suppressions.delete(ws, all.id);
      lifted.push(all.id);
      allLifted = true;
      for (const other of await r.topics.list(ws, { limit: MAX_TOPICS })) {
        if (formIds.has(other.id) || blockedIds.has(other.id)) continue;
        const { suppression } = await r.suppressions.create(ws, {
          email: submission.email,
          reason: 'unsubscribed',
          topicId: other.id,
          note: 'Kept from an all-topics unsubscribe when the person signed up again through a form for other topics.',
        });
        split.push(suppression.id);
      }
    }

    for (const topic of formTopics) {
      const own = blocks.find((b) => b.topic_id === topic.id) ?? null;
      if ((all && all.reason !== 'unsubscribed') || (own && own.reason !== 'unsubscribed')) {
        paused.push(topic);
        continue;
      }
      let wasBlocked = allLifted;
      if (own) {
        await r.suppressions.delete(ws, own.id);
        lifted.push(own.id);
        wasBlocked = true;
      }
      if (wasBlocked) resubscribed.push(topic);
      if (!contact.topics.includes(topic.slug) || wasBlocked) gained.push(topic);
      await r.contacts.subscribe(ws, contact.id, topic.id);
      subscribed.push(topic);
    }

    const tags = await r.tags.bySlugs(ws, form.tags);
    const tagsAdded = await r.tags.assign(
      ws,
      tags.map((t) => t.id),
      [contact.id],
    );

    const changed = created || gained.length > 0 || tagsAdded > 0;
    const confirmedRow = await r.signup.markConfirmed(ws, submission.id, { contactId: contact.id, ipHash: confirmedIpHash });
    if (!confirmedRow) throw new Error(`submission ${submission.id} changed while it was being confirmed`);
    if (!changed) return { kind: 'confirmed', workspace, form, paused: paused.length > 0, changed: false };

    const confirmedAt = confirmedRow.confirmed_at!;
    await tx`
      INSERT INTO contact_consents (workspace_id, contact_id, topic_id, source, signup_form_id, signup_form_version,
                                    consent_text, locale, submitted_ip_hash, confirmed_ip_hash, submitted_at, confirmed_at)
      SELECT ${ws}, ${contact.id}, t, 'signup_form', ${form.id}, ${submission.form_version}, ${submission.consent_text},
             ${submission.locale}, ${submission.submitted_ip_hash}, ${confirmedIpHash}, ${submission.created_at}::timestamptz,
             ${confirmedAt}::timestamptz
      FROM unnest(${subscribed.map((t) => t.id)}::uuid[]) AS t`;

    await r.audit.record(ws, {
      action: 'contact.subscribed',
      actor: ACTOR,
      targetType: 'contact',
      targetId: contact.id,
      details: {
        source: 'signup_form',
        signup_form_id: form.id,
        signup_form_version: submission.form_version,
        submission_id: submission.id,
        topics: subscribed.map((t) => t.slug),
        paused_topics: paused.map((t) => t.slug),
        tags_added: tagsAdded,
        contact_created: created,
        lifted_suppression_ids: lifted,
        created_suppression_ids: split,
      },
    });
    if (subscribed.length > 0) {
      await emitEvent(tx, ws, {
        type: 'contact.subscribed',
        data: {
          contact_id: contact.id,
          external_id: contact.external_id,
          email: contact.email,
          topics: subscribed.map((t) => t.slug),
          source: 'signup_form',
          signup_form_id: form.id,
          signup_form_version: submission.form_version,
          subscribed_at: confirmedAt,
        },
      });
    }
    for (const topic of resubscribed) {
      await emitEvent(tx, ws, {
        type: 'contact.resubscribed',
        data: {
          contact_id: contact.id,
          external_id: contact.external_id,
          email: contact.email,
          topic: topic.slug,
          mailing_id: null,
          source: 'signup_form',
          resubscribed_at: confirmedAt,
        },
      });
    }
    return { kind: 'confirmed', workspace, form, paused: paused.length > 0, changed: true };
  }

  return { formToken, checkFormToken, confirmToken, readConfirmToken, localeOf, submit, inspect, confirm, hashAddress, options: o, now };
}
