import { Hono } from 'hono';
import { mintApiKey } from '../api-key.js';
import { MANAGE, permit, READ_ADMIN, requireWorkspace } from '../auth.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import type { Sealer } from '../sealing.js';
import { ApiError } from '../errors.js';
import { idempotent, workspaceScope } from '../idempotency.js';
import { repos } from '../repo/index.js';
import { ApiKeyCreate, IdParams, PageQuery } from '../schemas.js';
import { jsonBody, pageArgs, params, query, toPage } from '../validate.js';

export function apiKeyRoutes(sql: Sql, sealer: Sealer) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const withWorkspace = requireWorkspace({ findMember: (ws, subject) => pool.members.bySubject(ws, subject) });
  const ledger = () => pool.idempotency;

  // The plaintext key is in this response and nowhere else, ever. With an
  // Idempotency-Key, a retry replays this same response (so a client that lost
  // the first answer to a network error still receives its key) instead of
  // minting a second one.
  app.post('/v1/api-keys', withWorkspace, permit(MANAGE), idempotent(ledger, sealer, workspaceScope), async (c) => {
    const access = c.get('access');
    const input = await jsonBody(c, ApiKeyCreate);
    const minted = await mintApiKey();
    const apiKey = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.apiKeys.create(access.workspaceId, {
        name: input.name,
        prefix: minted.prefix,
        keyHash: minted.hash,
        scope: input.scope ?? 'full',
        createdBy: actorOf(access),
      });
      await r.audit.record(access.workspaceId, {
        action: 'api_key.created',
        actor: actorOf(access),
        targetType: 'api_key',
        targetId: created.id,
        details: { name: created.name, prefix: created.prefix, scope: created.scope },
      });
      return created;
    });
    c.header('cache-control', 'no-store');
    return c.json({ key: minted.key, api_key: apiKey }, 201);
  });

  app.get('/v1/api-keys', withWorkspace, permit(READ_ADMIN), async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, PageQuery);
    const page = await pageArgs(q, (id) => pool.apiKeys.exists(workspaceId, id));
    const rows = await pool.apiKeys.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  // Revoking, never deleting: the row stays so the audit log keeps its target.
  app.delete('/v1/api-keys/:id', withWorkspace, permit(MANAGE), idempotent(ledger, sealer, workspaceScope), async (c) => {
    const access = c.get('access');
    const { id } = params(c, IdParams);
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const revoked = await r.apiKeys.revoke(access.workspaceId, id);
      if (!revoked) throw new ApiError('not_found', 'No such API key in this workspace.');
      if (revoked.changed) {
        await r.audit.record(access.workspaceId, {
          action: 'api_key.revoked',
          actor: actorOf(access),
          targetType: 'api_key',
          targetId: id,
          details: { name: revoked.key.name, prefix: revoked.key.prefix },
        });
      }
      return revoked.key;
    });
    return c.json(result);
  });

  return app;
}
