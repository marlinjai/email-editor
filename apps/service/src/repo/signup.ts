import type { SignupFormTranslation } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

export type SignupFormRow = {
  id: string;
  workspace_id: string;
  name: string;
  title: string;
  consent_text: string;
  translations: Record<string, SignupFormTranslation>;
  topics: string[];
  tags: string[];
  fields: ('first_name' | 'last_name')[];
  provider_id: string;
  confirmation_template_id: string | null;
  confirmation_html: string | null;
  redirect_url: string | null;
  allowed_origins: string[];
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SignupFormInput = {
  name: string;
  title: string;
  consentText: string;
  translations: Record<string, SignupFormTranslation>;
  topics: string[];
  tags: string[];
  fields: ('first_name' | 'last_name')[];
  providerId: string;
  confirmationTemplateId: string | null;
  confirmationHtml: string | null;
  redirectUrl: string | null;
  allowedOrigins: string[];
};

export type MailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export type SignupSubmissionRow = {
  id: string;
  workspace_id: string;
  form_id: string;
  form_version: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  locale: string;
  consent_text: string;
  submitted_ip_hash: string | null;
  created_at: string;
  expires_at: string;
  superseded_at: string | null;
  confirmed_at: string | null;
  confirmed_ip_hash: string | null;
  contact_id: string | null;
  mail_status: MailStatus;
  mail_attempts: number;
  mail_next_attempt_at: string;
  mail_claimed_at: string | null;
  mail_last_error: string | null;
  message_id: string | null;
};

const FORM = `id, workspace_id, name, title, consent_text, translations, topics, tags, fields, provider_id,
  confirmation_template_id, confirmation_html, redirect_url, allowed_origins, version, deleted_at, created_at, updated_at`;

const SUBMISSION = `id, workspace_id, form_id, form_version, email, first_name, last_name, locale, consent_text,
  submitted_ip_hash, created_at, expires_at, superseded_at, confirmed_at, confirmed_ip_hash, contact_id, mail_status,
  mail_attempts, mail_next_attempt_at, mail_claimed_at, mail_last_error, message_id`;

/**
 * Signup forms, their pending submissions and the rate-limit counters.
 *
 * Every function takes `workspaceId` first, except the named lookups of the
 * public endpoints, which have only an id from a URL: `findFormForPublic` (a
 * form page or submission names only the form) and `findSubmissionForPublic`
 * (a confirmation link names only the submission), and the outbox scans of the
 * platform job (`...ForWorker`). Each returns the row with its workspace, for
 * the scoped calls that follow.
 */
export function signupRepo(db: Db) {
  return {
    async createForm(workspaceId: string, input: SignupFormInput): Promise<SignupFormRow> {
      const rows = await db<SignupFormRow[]>`
        INSERT INTO signup_forms (workspace_id, name, title, consent_text, translations, topics, tags, fields, provider_id,
                                  confirmation_template_id, confirmation_html, redirect_url, allowed_origins)
        VALUES (${workspaceId}, ${input.name}, ${input.title}, ${input.consentText}, ${asJson(db, input.translations)},
                ${input.topics as string[]}::text[], ${input.tags as string[]}::text[], ${input.fields as string[]}::text[], ${input.providerId}, ${input.confirmationTemplateId},
                ${input.confirmationHtml}, ${input.redirectUrl}, ${input.allowedOrigins as string[]}::text[])
        RETURNING ${db.unsafe(FORM)}`;
      return rows[0]!;
    },

    /** Replaces every field and bumps the version. Null when the form does not exist (or was deleted). */
    async updateForm(workspaceId: string, formId: string, input: SignupFormInput): Promise<SignupFormRow | null> {
      const rows = await db<SignupFormRow[]>`
        UPDATE signup_forms SET
          name = ${input.name}, title = ${input.title}, consent_text = ${input.consentText},
          translations = ${asJson(db, input.translations)}, topics = ${input.topics as string[]}::text[], tags = ${input.tags as string[]}::text[],
          fields = ${input.fields as string[]}::text[], provider_id = ${input.providerId},
          confirmation_template_id = ${input.confirmationTemplateId}, confirmation_html = ${input.confirmationHtml},
          redirect_url = ${input.redirectUrl}, allowed_origins = ${input.allowedOrigins as string[]}::text[],
          version = version + 1, updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${formId} AND deleted_at IS NULL
        RETURNING ${db.unsafe(FORM)}`;
      return rows[0] ?? null;
    },

    /** A live form of the workspace, or null (unknown, another workspace's, or deleted). */
    async getForm(workspaceId: string, formId: string): Promise<SignupFormRow | null> {
      const rows = await db<SignupFormRow[]>`
        SELECT ${db.unsafe(FORM)} FROM signup_forms
        WHERE workspace_id = ${workspaceId} AND id = ${formId} AND deleted_at IS NULL`;
      return rows[0] ?? null;
    },

    /** A form of the workspace, deleted or not: a pending confirmation must know which. */
    async getFormAnyState(workspaceId: string, formId: string): Promise<SignupFormRow | null> {
      const rows = await db<SignupFormRow[]>`
        SELECT ${db.unsafe(FORM)} FROM signup_forms WHERE workspace_id = ${workspaceId} AND id = ${formId}`;
      return rows[0] ?? null;
    },

    async listForms(workspaceId: string, query: { afterId?: string; limit: number }): Promise<SignupFormRow[]> {
      return db<SignupFormRow[]>`
        SELECT ${db.unsafe(FORM)} FROM signup_forms
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        ${
          query.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM signup_forms WHERE workspace_id = ${workspaceId} AND id = ${query.afterId})`
            : db``
        }
        ORDER BY created_at, id LIMIT ${query.limit}`;
    },

    async softDeleteForm(workspaceId: string, formId: string): Promise<boolean> {
      const rows = await db`
        UPDATE signup_forms SET deleted_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${formId} AND deleted_at IS NULL RETURNING id`;
      return rows.length > 0;
    },

    /** The live form a public URL names, with its workspace. Unscoped: the id is all a URL carries. */
    async findFormForPublic(formId: string): Promise<SignupFormRow | null> {
      const rows = await db<SignupFormRow[]>`
        SELECT ${db.unsafe(FORM)} FROM signup_forms WHERE id = ${formId} AND deleted_at IS NULL`;
      return rows[0] ?? null;
    },

    /**
     * Records a submission and supersedes any earlier open one of the same
     * address to the same form, so only the newest confirmation link works.
     */
    async createSubmission(
      workspaceId: string,
      input: {
        formId: string;
        formVersion: number;
        email: string;
        firstName: string | null;
        lastName: string | null;
        locale: string;
        consentText: string;
        ipHash: string | null;
        validForMs: number;
      },
    ): Promise<{ submission: SignupSubmissionRow; superseded: number }> {
      const email = input.email.toLowerCase();
      const superseded = await db`
        UPDATE signup_submissions
        SET superseded_at = clock_timestamp(),
            mail_status = CASE WHEN mail_status = 'pending' THEN 'skipped' ELSE mail_status END
        WHERE workspace_id = ${workspaceId} AND form_id = ${input.formId} AND email = ${email}
          AND confirmed_at IS NULL AND superseded_at IS NULL
        RETURNING id`;
      const rows = await db<SignupSubmissionRow[]>`
        INSERT INTO signup_submissions (workspace_id, form_id, form_version, email, first_name, last_name, locale,
                                        consent_text, submitted_ip_hash, expires_at)
        VALUES (${workspaceId}, ${input.formId}, ${input.formVersion}, ${email}, ${input.firstName}, ${input.lastName},
                ${input.locale}, ${input.consentText}, ${input.ipHash},
                clock_timestamp() + make_interval(secs => ${input.validForMs / 1000}))
        RETURNING ${db.unsafe(SUBMISSION)}`;
      return { submission: rows[0]!, superseded: superseded.length };
    },

    async getSubmission(workspaceId: string, submissionId: string): Promise<SignupSubmissionRow | null> {
      const rows = await db<SignupSubmissionRow[]>`
        SELECT ${db.unsafe(SUBMISSION)} FROM signup_submissions WHERE workspace_id = ${workspaceId} AND id = ${submissionId}`;
      return rows[0] ?? null;
    },

    /** Reads and locks a submission for the rest of the transaction (confirming it, sending its mail). */
    async lockSubmission(workspaceId: string, submissionId: string): Promise<SignupSubmissionRow | null> {
      const rows = await db<SignupSubmissionRow[]>`
        SELECT ${db.unsafe(SUBMISSION)} FROM signup_submissions
        WHERE workspace_id = ${workspaceId} AND id = ${submissionId} FOR UPDATE`;
      return rows[0] ?? null;
    },

    /** The submission a confirmation link names, with its workspace. Unscoped: the link carries only the id. */
    async findSubmissionForPublic(submissionId: string): Promise<SignupSubmissionRow | null> {
      const rows = await db<SignupSubmissionRow[]>`
        SELECT ${db.unsafe(SUBMISSION)} FROM signup_submissions WHERE id = ${submissionId}`;
      return rows[0] ?? null;
    },

    async markConfirmed(
      workspaceId: string,
      submissionId: string,
      input: { contactId: string; ipHash: string | null },
    ): Promise<SignupSubmissionRow | null> {
      const rows = await db<SignupSubmissionRow[]>`
        UPDATE signup_submissions SET
          confirmed_at = clock_timestamp(), confirmed_ip_hash = ${input.ipHash}, contact_id = ${input.contactId},
          mail_status = CASE WHEN mail_status = 'pending' THEN 'skipped' ELSE mail_status END
        WHERE workspace_id = ${workspaceId} AND id = ${submissionId} AND confirmed_at IS NULL AND superseded_at IS NULL
        RETURNING ${db.unsafe(SUBMISSION)}`;
      return rows[0] ?? null;
    },

    /**
     * The next confirmation mail that is due, locked with `SKIP LOCKED` so two
     * workers never take the same one. Across workspaces; the row names its own.
     */
    async claimDueMailForWorker(): Promise<SignupSubmissionRow | null> {
      const rows = await db<SignupSubmissionRow[]>`
        SELECT ${db.unsafe(SUBMISSION)} FROM signup_submissions
        WHERE mail_status = 'pending' AND mail_next_attempt_at <= now()
        ORDER BY mail_next_attempt_at, id
        LIMIT 1 FOR UPDATE SKIP LOCKED`;
      return rows[0] ?? null;
    },

    /** Moves the mail on; `from` guards against a concurrent change (compare-and-set). */
    async setMail(
      workspaceId: string,
      submissionId: string,
      from: readonly MailStatus[],
      to:
        | { status: 'sending' }
        | { status: 'sent'; messageId: string }
        | { status: 'failed'; error: string; messageId?: string | null }
        | { status: 'skipped'; error?: string }
        | { status: 'pending'; retryInMs: number; error?: string; countAttempt?: boolean },
    ): Promise<boolean> {
      const rows = await db`
        UPDATE signup_submissions SET
          mail_status = ${to.status},
          mail_attempts = ${to.status === 'sending' ? db`mail_attempts + 1` : db`mail_attempts`},
          mail_claimed_at = ${to.status === 'sending' ? db`now()` : to.status === 'pending' ? null : db`mail_claimed_at`},
          mail_next_attempt_at = ${
            to.status === 'pending' ? db`now() + make_interval(secs => ${to.retryInMs / 1000})` : db`mail_next_attempt_at`
          },
          mail_last_error = ${'error' in to && to.error !== undefined ? to.error : db`mail_last_error`},
          message_id = ${'messageId' in to && to.messageId !== undefined ? to.messageId : db`message_id`}
        WHERE workspace_id = ${workspaceId} AND id = ${submissionId} AND mail_status = ANY(${from as MailStatus[]})
        RETURNING id`;
      return rows.length > 0;
    },

    /** Mails left `sending` since before `claimedBefore`: a worker died mid-send. */
    async listStuckMailForWorker(claimedBefore: Date, limit: number): Promise<Array<{ workspace_id: string; id: string }>> {
      return db<Array<{ workspace_id: string; id: string }>>`
        SELECT workspace_id, id FROM signup_submissions
        WHERE mail_status = 'sending' AND mail_claimed_at < ${claimedBefore}
        ORDER BY mail_claimed_at, id LIMIT ${limit}`;
    },

    /**
     * Data minimisation: submissions that can no longer be confirmed (expired,
     * superseded) or were confirmed (the consent record keeps what matters) are
     * deleted once older than `olderThanMs`, and so are old rate-limit windows.
     * Across workspaces. Returns how many rows went.
     */
    async purgeForWorker(olderThanMs: number): Promise<number> {
      const subs = await db`
        DELETE FROM signup_submissions
        WHERE created_at < now() - make_interval(secs => ${olderThanMs / 1000})
          AND (confirmed_at IS NOT NULL OR superseded_at IS NOT NULL OR expires_at < now())
          AND mail_status <> 'sending'
        RETURNING id`;
      const windows = await db`
        DELETE FROM signup_rate_limits WHERE window_start < now() - interval '1 day' RETURNING workspace_id`;
      return subs.length + windows.length;
    },

    /**
     * Counts one hit in the current fixed window of `windowMs` and returns the
     * count after it. Windows are aligned on the database clock.
     */
    async hit(workspaceId: string, scope: 'ip' | 'workspace', keyHash: string, windowMs: number): Promise<number> {
      const rows = await db<{ count: number }[]>`
        INSERT INTO signup_rate_limits (workspace_id, scope, key_hash, window_start, count)
        VALUES (${workspaceId}, ${scope}, ${keyHash},
                to_timestamp(floor(extract(epoch FROM now()) * 1000 / ${windowMs}) * ${windowMs} / 1000), 1)
        ON CONFLICT (workspace_id, scope, key_hash, window_start) DO UPDATE SET count = signup_rate_limits.count + 1
        RETURNING count`;
      return rows[0]!.count;
    },
  };
}
