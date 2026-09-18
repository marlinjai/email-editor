import { EDITABLE_MAILING_STATUSES, type Segment, type SegmentFilter } from '@marlinjai/mail-contract';
import { Hono } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv } from '../context.js';
import type { Db, Sql } from '../db.js';
import { mount, type MountDeps } from '../mount.js';
import { effectiveTracking } from '../platform/tracking-settings.js';
import { repos } from '../repo/index.js';
import type { SegmentRow } from '../repo/segments.js';
import { checkFilter, compileFilter, engagementKinds, type Fragment } from '../segments/compile.js';
import { body, pageArgs, params, query, rowId, toPage } from '../validate.js';

const SAMPLE_SIZE = 5;

function notFound(): never {
  throw new ApiError('not_found', 'No such segment in this workspace.');
}

/**
 * A compiled filter. Boxed, because a postgres.js fragment is a thenable: an
 * async function that returned one bare would run it as a query on `await`.
 */
type Compiled = { where: Fragment };

/**
 * Checks a filter a caller is saving or using: operators and values, and that
 * the engagement fields it uses are tracked in the workspace now. Then
 * compiles it.
 */
async function prepare(db: Db, workspaceId: string, filter: SegmentFilter, path = ['filter']): Promise<Compiled> {
  const types = await repos(db).contactProperties.types(workspaceId);
  checkFilter(filter, types, path);
  const kinds = engagementKinds(filter);
  if (kinds.size > 0) {
    const tracking = await effectiveTracking(db, workspaceId);
    const missing = [...kinds].filter((k) => (k === 'open' ? !tracking.opens : !tracking.clicks));
    if (missing.length > 0) {
      const what = missing.map((k) => (k === 'open' ? 'Opens' : 'Clicks')).join(' and ');
      throw new ApiError(
        'tracking_disabled',
        `${what} are not tracked in this workspace, so a segment cannot filter on engagement. Turn tracking on first.`,
        { tracking: missing.map((k) => (k === 'open' ? 'opens' : 'clicks')) },
      );
    }
  }
  return { where: compileFilter({ db, workspaceId, types }, filter) };
}

/**
 * A stored segment's filter, compiled for counting on read. It was checked
 * when saved; engagement is counted from the events that exist even if
 * tracking was turned off since (only saving and sending require it on).
 */
async function compileStored(db: Db, workspaceId: string, filter: SegmentFilter): Promise<Compiled> {
  const types = await repos(db).contactProperties.types(workspaceId);
  checkFilter(filter, types);
  return { where: compileFilter({ db, workspaceId, types }, filter) };
}

async function toSegment(db: Db, workspaceId: string, row: SegmentRow): Promise<Segment> {
  let count: number;
  try {
    count = await repos(db).segments.countMatching(workspaceId, (await compileStored(db, workspaceId, row.filter)).where);
  } catch (err) {
    // A property definition added since the segment was saved can make an
    // operator invalid for the key's new type. The segment still reads; it
    // counts nobody until it is fixed, and saving it again says why.
    if (err instanceof ApiError && err.code === 'validation_failed') count = 0;
    else throw err;
  }
  return { id: row.id, name: row.name, filter: row.filter, contact_count: count, created_at: row.created_at, updated_at: row.updated_at };
}

/**
 * Segments: saved filters over contacts, their tags, properties, topic
 * subscriptions and engagement. The filter compiles to parameterised SQL
 * (src/segments/compile.ts) on every use, so a count is always current.
 */
export function segmentRoutes(sql: Sql, deps: MountDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;

  mount(app, 'segments.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'segments.list');
    const page = await pageArgs(q, async (id) => (await pool.segments.get(workspaceId, id)) !== null);
    const rows = await pool.segments.list(workspaceId, { afterId: page.afterId, limit: page.limit + 1 });
    const { data, next_cursor } = toPage(rows, page.limit);
    const out: Segment[] = [];
    for (const row of data) out.push(await toSegment(sql, workspaceId, row));
    return c.json({ data: out, next_cursor });
  });

  mount(app, 'segments.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'segments.create');
    const segment = await sql.begin(async (tx) => {
      await prepare(tx, access.workspaceId, input.filter);
      const r = repos(tx);
      const row = await r.segments.create(access.workspaceId, { name: input.name, filter: input.filter });
      await r.audit.record(access.workspaceId, {
        action: 'segment.created',
        actor: actorOf(access),
        targetType: 'segment',
        targetId: row.id,
        details: { name: row.name },
      });
      return toSegment(tx, access.workspaceId, row);
    });
    return c.json(segment, 201);
  });

  mount(app, 'segments.preview', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const input = await body(c, 'segments.preview');
    const { where } = await prepare(sql, workspaceId, input.filter);
    const [count, sample] = await Promise.all([
      pool.segments.countMatching(workspaceId, where),
      pool.segments.sampleMatching(workspaceId, where, SAMPLE_SIZE),
    ]);
    return c.json({ contact_count: count, sample });
  });

  mount(app, 'segments.get', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const row = await pool.segments.get(workspaceId, rowId(params(c, 'segments.get').id, 'segment'));
    if (!row) notFound();
    return c.json(await toSegment(sql, workspaceId, row));
  });

  mount(app, 'segments.update', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'segments.update').id, 'segment');
    const input = await body(c, 'segments.update');
    const segment = await sql.begin(async (tx) => {
      await prepare(tx, access.workspaceId, input.filter);
      const r = repos(tx);
      const row = await r.segments.update(access.workspaceId, id, { name: input.name, filter: input.filter });
      if (!row) notFound();
      await r.audit.record(access.workspaceId, {
        action: 'segment.updated',
        actor: actorOf(access),
        targetType: 'segment',
        targetId: id,
        details: { name: row.name },
      });
      return toSegment(tx, access.workspaceId, row);
    });
    return c.json(segment);
  });

  mount(app, 'segments.delete', deps, async (c) => {
    const access = c.get('access');
    const id = rowId(params(c, 'segments.delete').id, 'segment');
    await sql.begin(async (tx) => {
      const r = repos(tx);
      const row = await r.segments.get(access.workspaceId, id);
      if (!row) notFound();
      await r.segments.delete(access.workspaceId, id);
      await r.audit.record(access.workspaceId, {
        action: 'segment.deleted',
        actor: actorOf(access),
        targetType: 'segment',
        targetId: id,
        details: { name: row.name },
      });
    });
    return c.json({ ok: true as const });
  });

  mount(app, 'mailings.addSegment', deps, async (c) => {
    const access = c.get('access');
    const mailingId = rowId(params(c, 'mailings.addSegment').id, 'mailing');
    const input = await body(c, 'mailings.addSegment');
    const result = await sql.begin(async (tx) => {
      const r = repos(tx);
      const mailing = await r.mailings.lock(access.workspaceId, mailingId);
      if (!mailing) throw new ApiError('not_found', 'No such mailing in this workspace.');
      if (!EDITABLE_MAILING_STATUSES.includes(mailing.status)) {
        throw new ApiError('mailing_invalid_state', `Recipients can no longer be added to a ${mailing.status} mailing.`, {
          status: mailing.status,
        });
      }
      const segment = await r.segments.get(access.workspaceId, rowId(input.segment_id, 'segment'));
      if (!segment) notFound();
      // A stored segment is checked again: sending decides on it now.
      const { where } = await prepare(tx, access.workspaceId, segment.filter, ['segment', 'filter']);
      const { matched, added } = await r.segments.queueMatching(access.workspaceId, mailingId, mailing.topic_id, where);
      return { added, already_present: matched - added, rejected: [] };
    });
    return c.json(result);
  });

  return app;
}
