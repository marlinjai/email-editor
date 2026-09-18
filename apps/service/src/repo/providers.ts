import type { ProviderKind, ProviderPolicy } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { asJson } from './json.js';

/**
 * A provider as stored, without its secret. `config` holds only the non-secret
 * settings (for SMTP: host, port, security, username); `has_secret` says whether
 * a sealed credential exists. Routes shape this into the contract's `Provider`.
 */
export type ProviderRow = {
  id: string;
  kind: ProviderKind;
  name: string;
  config: Record<string, unknown>;
  has_secret: boolean;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  daily_recipient_budget: number;
  min_interval_ms: number;
  max_recipients_per_message: number;
  created_at: string;
  updated_at: string;
};

/** What the worker needs to send: the row plus the sealed credential (opened with the Sealer, never logged). */
export type ProviderForSend = ProviderRow & { secret_sealed: string | null };

const COLUMNS = `id, kind, name, config, secret_sealed IS NOT NULL AS has_secret, from_name, from_email, reply_to,
  daily_recipient_budget, min_interval_ms, max_recipients_per_message, created_at, updated_at`;

export function policyOf(row: ProviderRow): ProviderPolicy {
  return {
    daily_recipient_budget: row.daily_recipient_budget,
    min_interval_ms: row.min_interval_ms,
    max_recipients_per_message: row.max_recipients_per_message,
  };
}

export function providersRepo(db: Db) {
  return {
    /** `secretSealed` is the output of `Sealer.seal`; the table refuses anything else. */
    async create(
      workspaceId: string,
      input: {
        kind: ProviderKind;
        name: string;
        config: Record<string, unknown>;
        secretSealed: string | null;
        fromName: string;
        fromEmail: string;
        replyTo: string | null;
        policy: ProviderPolicy;
      },
    ): Promise<ProviderRow> {
      const rows = await db<ProviderRow[]>`
        INSERT INTO providers (workspace_id, kind, name, config, secret_sealed, from_name, from_email, reply_to,
                               daily_recipient_budget, min_interval_ms, max_recipients_per_message)
        VALUES (${workspaceId}, ${input.kind}, ${input.name}, ${asJson(db, input.config)}, ${input.secretSealed},
                ${input.fromName}, ${input.fromEmail.toLowerCase()}, ${input.replyTo?.toLowerCase() ?? null},
                ${input.policy.daily_recipient_budget}, ${input.policy.min_interval_ms},
                ${input.policy.max_recipients_per_message})
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0]!;
    },

    /** A deleted provider is not found. */
    async get(workspaceId: string, providerId: string): Promise<ProviderRow | null> {
      const rows = await db<ProviderRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM providers
        WHERE workspace_id = ${workspaceId} AND id = ${providerId} AND deleted_at IS NULL`;
      return rows[0] ?? null;
    },

    /**
     * The provider with its sealed secret, for the worker and for `verify`. Also
     * finds a deleted provider, since a mailing already sending keeps its provider.
     */
    async getForSend(workspaceId: string, providerId: string): Promise<ProviderForSend | null> {
      const rows = await db<ProviderForSend[]>`
        SELECT ${db.unsafe(COLUMNS)}, secret_sealed FROM providers
        WHERE workspace_id = ${workspaceId} AND id = ${providerId}`;
      return rows[0] ?? null;
    },

    async list(workspaceId: string, page: { afterId?: string; limit: number }): Promise<ProviderRow[]> {
      return db<ProviderRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM providers
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        ${
          page.afterId
            ? db`AND (created_at, id) > (SELECT created_at, id FROM providers WHERE workspace_id = ${workspaceId} AND id = ${page.afterId})`
            : db``
        }
        ORDER BY created_at, id
        LIMIT ${page.limit}`;
    },

    /**
     * Applies the given fields; an omitted field keeps its value. `config` is
     * merged key by key into the stored one. `secretSealed` replaces the secret
     * only when given.
     */
    async update(
      workspaceId: string,
      providerId: string,
      patch: {
        name?: string;
        config?: Record<string, unknown>;
        secretSealed?: string;
        fromName?: string;
        fromEmail?: string;
        replyTo?: string | null;
        policy?: Partial<ProviderPolicy>;
      },
    ): Promise<ProviderRow | null> {
      const rows = await db<ProviderRow[]>`
        UPDATE providers SET
          name = COALESCE(${patch.name ?? null}, name),
          config = config || COALESCE(${patch.config ? asJson(db, patch.config) : null}::jsonb, '{}'::jsonb),
          secret_sealed = COALESCE(${patch.secretSealed ?? null}, secret_sealed),
          from_name = COALESCE(${patch.fromName ?? null}, from_name),
          from_email = COALESCE(${patch.fromEmail?.toLowerCase() ?? null}, from_email),
          reply_to = ${patch.replyTo === undefined ? db`reply_to` : db`${patch.replyTo?.toLowerCase() ?? null}`},
          daily_recipient_budget = COALESCE(${patch.policy?.daily_recipient_budget ?? null}::integer, daily_recipient_budget),
          min_interval_ms = COALESCE(${patch.policy?.min_interval_ms ?? null}::integer, min_interval_ms),
          max_recipients_per_message = COALESCE(${patch.policy?.max_recipients_per_message ?? null}::integer, max_recipients_per_message),
          updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${providerId} AND deleted_at IS NULL
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0] ?? null;
    },

    /** Soft delete: mailings and archived messages keep pointing at the row. */
    async softDelete(workspaceId: string, providerId: string): Promise<boolean> {
      const rows = await db`
        UPDATE providers SET deleted_at = now(), updated_at = now()
        WHERE workspace_id = ${workspaceId} AND id = ${providerId} AND deleted_at IS NULL
        RETURNING id`;
      return rows.length > 0;
    },

    /**
     * Locks the provider row for the rest of the transaction. The budget takes
     * it before reading the ledger, so two workers cannot both pass the check.
     */
    async lock(workspaceId: string, providerId: string): Promise<ProviderRow | null> {
      const rows = await db<ProviderRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM providers
        WHERE workspace_id = ${workspaceId} AND id = ${providerId}
        FOR UPDATE`;
      return rows[0] ?? null;
    },
  };
}
