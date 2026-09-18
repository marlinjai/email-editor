import { DEFAULT_PAGE_LIMIT } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import type { WorkspaceCompile } from '../compile/workspace-compile.js';
import { actorLabel, actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { schemaVersionOf, validateDocument } from '../documents.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { checkBody, pageArgs, params, query, rawJson, rowId, toPage } from '../validate.js';

/**
 * A body that carries a document is checked by the editor core first, so a
 * document from a newer editor is reported as `NEWER_VERSION` with the version
 * it declares, rather than as a bare enum mismatch on `document.version`.
 */
function documentFirst(raw: unknown): void {
  if (typeof raw === 'object' && raw !== null && 'document' in raw) {
    validateDocument((raw as { document: unknown }).document);
  }
}

const notFound = () => new ApiError('not_found', 'No such template in this workspace.');

export function templateRoutes(sql: Sql, deps: MountDeps & { compiler: WorkspaceCompile }) {
  const app = new Hono<AppEnv>();
  const { pool, compiler } = deps;

  mount(app, 'templates.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'templates.list');
    const page = await pageArgs(q, (id) => pool.templates.exists(workspaceId, id));
    const rows = await pool.templates.list(workspaceId, {
      afterId: page.afterId,
      limit: page.limit + 1,
      archived: q.archived === undefined ? undefined : q.archived === 'true',
    });
    return c.json(toPage(rows, page.limit));
  });

  mount(app, 'templates.create', deps, async (c) => {
    const access = c.get('access');
    const raw = await rawJson(c);
    documentFirst(raw);
    const input = checkBody('templates.create', raw);
    const document = validateDocument(input.document);
    const template = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.templates.create(access.workspaceId, {
        name: input.name,
        description: input.description ?? null,
        document: document as unknown as Record<string, unknown>,
        schemaVersion: schemaVersionOf(document),
        createdBy: actorLabel(access),
      });
      await r.audit.record(access.workspaceId, {
        action: 'template.created',
        actor: actorOf(access),
        targetType: 'template',
        targetId: created.id,
        details: { name: created.name, version: created.version },
      });
      return created;
    });
    return c.json(template, 201);
  });

  mount(app, 'templates.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'templates.get').id, 'template');
    const template = await pool.templates.get(workspaceId, id);
    if (!template) throw notFound();
    return c.json(template);
  });

  // Optimistic locking: the save names the version the editor loaded. If
  // someone else saved since, it is a conflict carrying the current version,
  // and nothing is overwritten. A save identical to the current state is not a
  // new version.
  mount(app, 'templates.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'templates.update').id, 'template');
    const raw = await rawJson(c);
    documentFirst(raw);
    const input = checkBody('templates.update', raw);
    const document = input.document === undefined ? undefined : validateDocument(input.document);

    const outcome = await sql.begin(async (tx) => {
      const r = repos(tx);
      const result = await r.templates.save(
        access.workspaceId,
        id,
        input.base_version,
        {
          name: input.name,
          description: input.description,
          document: document as unknown as Record<string, unknown> | undefined,
          schemaVersion: document ? schemaVersionOf(document) : undefined,
          archived: input.archived,
        },
        actorLabel(access),
      );
      if (result.kind === 'saved') {
        await r.audit.record(access.workspaceId, {
          action: 'template.updated',
          actor: actorOf(access),
          targetType: 'template',
          targetId: id,
          details: { version: result.template.version, name: result.template.name, archived: result.template.archived_at !== null },
        });
      }
      return result;
    });

    switch (outcome.kind) {
      case 'not_found':
        throw notFound();
      case 'conflict':
        throw new ApiError(
          'conflict',
          `The template is at version ${outcome.currentVersion}, not ${input.base_version}: someone saved it since it was loaded. Reload it and apply the change again.`,
          { current_version: outcome.currentVersion },
        );
      default:
        return c.json(outcome.template);
    }
  });

  mount(app, 'templates.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'templates.delete').id, 'template');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const deleted = await r.templates.delete(access.workspaceId, id);
      if (!deleted) throw notFound();
      await r.audit.record(access.workspaceId, {
        action: 'template.deleted',
        actor: actorOf(access),
        targetType: 'template',
        targetId: id,
        details: { name: deleted.name, version: deleted.version },
      });
    });
    return c.json({ ok: true as const });
  });

  // Newest first. The cursor is the last version number of the previous page.
  mount(app, 'templates.versions', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'templates.versions').id, 'template');
    const q = query(c, 'templates.versions');
    if (!(await pool.templates.exists(workspaceId, id))) throw notFound();
    let beforeVersion: number | undefined;
    if (q.cursor !== undefined) {
      if (!/^[1-9][0-9]{0,9}$/.test(q.cursor)) {
        throw new ApiError('invalid_cursor', 'The cursor is not valid for this list. Start again without one.');
      }
      beforeVersion = Number(q.cursor);
    }
    const limit = q.limit ?? DEFAULT_PAGE_LIMIT;
    const rows = await pool.templates.versions(workspaceId, id, { beforeVersion, limit: limit + 1 });
    const data = rows.slice(0, limit);
    return c.json({ data, next_cursor: rows.length > limit ? String(data[data.length - 1]!.version) : null });
  });

  mount(app, 'templates.version', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const p = params(c, 'templates.version');
    const id = rowId(p.id, 'template');
    const version = await pool.templates.version(workspaceId, id, p.version);
    if (!version) {
      if (!(await pool.templates.exists(workspaceId, id))) throw notFound();
      throw new ApiError('not_found', `This template has no version ${p.version}.`);
    }
    return c.json(version);
  });

  // Compiles the current document, or a past version's. Always 200 once the
  // document is readable: problems are in `errors`, which block sending.
  mount(app, 'templates.compile', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'templates.compile').id, 'template');
    const raw = await rawJson(c);
    const input = checkBody('templates.compile', raw ?? {});
    let stored: Record<string, unknown>;
    if (input.version === undefined) {
      const template = await pool.templates.get(workspaceId, id);
      if (!template) throw notFound();
      stored = template.document;
    } else {
      const version = await pool.templates.version(workspaceId, id, input.version);
      if (!version) {
        if (!(await pool.templates.exists(workspaceId, id))) throw notFound();
        throw new ApiError('not_found', `This template has no version ${input.version}.`);
      }
      stored = version.document;
    }
    // Stored documents passed validation when saved; a later build may still
    // need to migrate an older schema version before compiling it.
    return c.json(await compiler.compile(workspaceId, validateDocument(stored)));
  });

  mount(app, 'compile', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const raw = await rawJson(c);
    documentFirst(raw);
    const input = checkBody('compile', raw);
    return c.json(await compiler.compile(workspaceId, validateDocument(input.document)));
  });

  return app;
}
