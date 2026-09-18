import { describe, expect, it } from 'vitest';
import { createTestClient, jsonResponse } from './test-helpers';

describe('paginate', () => {
  it('walks every page to exhaustion, yielding items in order', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'a' }, { id: 'b' }], next_cursor: 'cursor_1' }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'c' }], next_cursor: null }));

    const ids: string[] = [];
    for await (const item of client.paginate('members.list', {}, undefined)) {
      ids.push((item as { id: string }).id);
    }

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = String(fetchMock.mock.calls[1]![0]);
    expect(secondUrl).toContain('cursor=cursor_1');
  });

  it('stops cleanly on an empty first page', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }));

    const items: unknown[] = [];
    for await (const item of client.paginate('members.list')) {
      items.push(item);
    }

    expect(items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws rather than looping forever if the service repeats a cursor', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'a' }], next_cursor: 'cursor_1' }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'b' }], next_cursor: 'cursor_1' }));

    async function drain() {
      const items: unknown[] = [];
      for await (const item of client.paginate('members.list')) items.push(item);
      return items;
    }

    await expect(drain()).rejects.toThrow(/repeated pagination cursor/);
  });

  it('passes path params through for a nested list route', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }));

    const items: unknown[] = [];
    for await (const item of client.paginate('templates.versions', { params: { id: 'tpl_1' } })) items.push(item);

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe('https://mail.test.internal/v1/templates/tpl_1/versions');
  });
});
