import { Hono } from 'hono';
import { mintApiKey } from '../api-key.js';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

export function apiKeyRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  // The plaintext key is in this response and nowhere else in the clear. With an
  // Idempotency-Key, a retry replays this same response from the sealed ledger
  // (so a client that lost the first answer to a network error still receives
  // its key) instead of minting a second one.
  mount(app, 'apiKeys.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'apiKeys.create');
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

  mount(app, 'apiKeys.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'apiKeys.list');
    const page = await pageArgs(q, (id) => pool.apiKeys.exists(workspaceId, id));
    const rows = await pool.apiKeys.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    return c.json(toPage(rows, page.limit));
  });

  // Revoking, never deleting: the row stays so the audit log keeps its target.
  mount(app, 'apiKeys.revoke', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'apiKeys.revoke').id, 'API key');
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
