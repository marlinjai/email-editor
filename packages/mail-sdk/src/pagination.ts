import type { Page, OperationId, RouteParams, RouteQuery, RouteResponse } from '@marlinjai/mail-contract';
import { execute, type CoreConfig, type RequestOpts } from './core';

/**
 * Operations whose response is a cursor page (`{ data, next_cursor }`). Excludes
 * the two S4/S5 list routes that return a bare `{ data }` array with no cursor
 * (`contactProperties.list`, `billing.plans`): those are not paginatable, and the
 * exclusion is enforced here at compile time, not by convention.
 */
export type PaginatableOperationId = {
  [K in OperationId]: RouteResponse<K> extends Page<unknown> ? K : never;
}[OperationId];

export type PageItem<K extends PaginatableOperationId> = RouteResponse<K> extends Page<infer T> ? T : never;

export interface PaginateArgs<K extends PaginatableOperationId> {
  params?: RouteParams<K>;
  query?: RouteQuery<K>;
}

/**
 * Walks every page of a cursor-paginated list, yielding one item at a time.
 * Stops cleanly on an empty first page (`next_cursor: null` with `data: []`) and
 * throws if the service ever repeats a cursor, rather than looping forever.
 */
export async function* paginate<K extends PaginatableOperationId>(
  config: CoreConfig,
  operationId: K,
  args: PaginateArgs<K> = {},
  opts: RequestOpts = {},
): AsyncGenerator<PageItem<K>, void, void> {
  let cursor: string | undefined = (args.query as { cursor?: string } | undefined)?.cursor;
  const seenCursors = new Set<string>();

  for (;;) {
    const query = { ...(args.query as Record<string, unknown> | undefined), cursor } as unknown as RouteQuery<K>;
    const result = await execute(config, operationId, { params: args.params, query }, opts);
    const page = result as unknown as Page<PageItem<K>>;
    for (const item of page.data) yield item;
    if (page.next_cursor === null) return;
    if (seenCursors.has(page.next_cursor)) {
      throw new Error(`mail service returned a repeated pagination cursor for "${operationId}"`);
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}
