import type { ContactPropertyDefinition } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import type { ContactPropertyRow } from '../repo/contact-properties.js';
import { body, params } from '../validate.js';

function toDefinition(row: ContactPropertyRow): ContactPropertyDefinition {
  return { key: row.key, label: row.label, type: row.type };
}

/**
 * Typed contact properties. Defining a key makes every later write of it
 * type-checked (contacts.upsert, CSV import). A definition that data already
 * stored would break is refused with `conflict` and examples, so a definition
 * never describes values that are not true of it. Deleting a definition keeps
 * the values; the key is free-form again.
 */
export function contactPropertyRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'contactProperties.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const rows = await pool.contactProperties.list(workspaceId);
    return c.json({ data: rows.map(toDefinition) });
  });

  mount(app, 'contactProperties.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'contactProperties.create');
    const created = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (await r.contactProperties.get(access.workspaceId, input.key)) {
        throw new ApiError('already_exists', `The property "${input.key}" is already defined in this workspace.`, {
          key: input.key,
        });
      }
      // Exclusive against every property write of this workspace (they take the
      // same lock shared), so no value of the wrong type can land between this
      // check and the definition's commit.
      await r.contactProperties.lockDefinitions(access.workspaceId, 'exclusive');
      const broken = await r.contactProperties.violations(access.workspaceId, input.key, input.type, 5);
      if (broken.length > 0) {
        throw new ApiError(
          'conflict',
          `Some contacts already store a value of "${input.key}" that is not a ${input.type}. Fix or remove those values first.`,
          { key: input.key, type: input.type, contact_ids: broken.map((b) => b.id) },
        );
      }
      const row = await r.contactProperties.create(access.workspaceId, input);
      if (!row) {
        throw new ApiError('already_exists', `The property "${input.key}" is already defined in this workspace.`, {
          key: input.key,
        });
      }
      await r.audit.record(access.workspaceId, {
        action: 'contact_property.created',
        actor: actorOf(access),
        targetType: 'contact_property',
        targetId: null,
        details: { key: row.key, type: row.type },
      });
      return row;
    });
    return c.json(toDefinition(created), 201);
  });

  mount(app, 'contactProperties.delete', deps, async (c) => {
    const access = c.get('access');
    const { key } = params(c, 'contactProperties.delete');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const existing = await r.contactProperties.get(access.workspaceId, key);
      if (!existing) throw new ApiError('not_found', `No property "${key}" is defined in this workspace.`);
      await r.contactProperties.delete(access.workspaceId, key);
      await r.audit.record(access.workspaceId, {
        action: 'contact_property.deleted',
        actor: actorOf(access),
        targetType: 'contact_property',
        targetId: null,
        details: { key, type: existing.type },
      });
    });
    return c.json({ ok: true as const });
  });

  return app;
}
