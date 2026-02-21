import { describe, it, expect, vi } from 'vitest';
import { usePaginatedQuery } from './use-paginated-query';
import type { PaginatedResult } from '../types';

// Mock React hooks for a Node environment
let stateStore: Record<string, unknown> = {};
let stateCounter = 0;
let effects: Array<() => void> = [];

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const key = `state_${stateCounter++}`;
    if (!(key in stateStore)) {
      stateStore[key] = initial;
    }
    return [stateStore[key], (val: unknown) => { stateStore[key] = val; }];
  },
  useEffect: (fn: () => void) => {
    effects.push(fn);
  },
  useCallback: (fn: Function) => fn,
  useRef: (val: unknown) => ({ current: val }),
}));

describe('usePaginatedQuery', () => {
  beforeEach(() => {
    stateStore = {};
    stateCounter = 0;
    effects = [];
  });

  it('returns initial state with loading true', () => {
    const queryFn = vi.fn().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totalPages: 0,
    } satisfies PaginatedResult<unknown>);

    const result = usePaginatedQuery(queryFn);

    expect(result.loading).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(typeof result.setPage).toBe('function');
    expect(typeof result.refresh).toBe('function');
  });

  it('triggers effect on mount', () => {
    const queryFn = vi.fn().mockResolvedValue({
      data: [{ id: '1' }],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });

    usePaginatedQuery(queryFn);

    expect(effects.length).toBeGreaterThan(0);
  });
});
