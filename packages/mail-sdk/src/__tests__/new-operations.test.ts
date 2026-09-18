import { describe, expect, it } from 'vitest';
import { createTestClient, jsonResponse } from './test-helpers';

/**
 * Operations added to `@marlinjai/mail-contract` after the SDK's first cut
 * (email-editor #7): workspace creation/listing, members bound by subject
 * instead of an email invite, and the service's health probe.
 */

describe('members.add', () => {
  it('adds a member by auth-brain subject', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));

    await client.members.add({
      subject: 'auth-brain|person_2',
      email: 'person2@example.com',
      name: 'Person Two',
      role: 'editor',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/members');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ subject: 'auth-brain|person_2', role: 'editor' });
  });
});

describe('workspaces (plural, dashboard-only)', () => {
  it('creates a workspace', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));

    await client.workspaces.create({
      slug: 'opuntia',
      name: 'ŌPUNTIA',
      owner: { email: 'admin@example.com' },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/workspaces');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('lists workspaces for the signed-in person', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }));

    await client.workspaces.list();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/workspaces');
    expect((init as RequestInit).method).toBe('GET');
  });
});

describe('health', () => {
  it('resolves true on a 2xx from HEALTH_PATH, with no auth headers', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const ok = await client.health();
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/healthz');
    expect((init as RequestInit).headers).toBeUndefined();
  });

  it('resolves false on a non-2xx, without throwing', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(client.health()).resolves.toBe(false);
  });

  it('resolves false on a network failure, without throwing', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(client.health()).resolves.toBe(false);
  });
});

describe('assets.import', () => {
  it('posts the remote address as JSON to /v1/assets/import', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));

    await client.assets.import({ url: 'https://cdn.example.com/hero.png' }, { idempotencyKey: 'import-hero' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/assets/import');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ url: 'https://cdn.example.com/hero.png' });
    expect(new Headers((init as RequestInit).headers).get('idempotency-key')).toBe('import-hero');
  });
});
