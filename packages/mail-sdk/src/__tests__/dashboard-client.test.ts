import { describe, expect, it, vi } from 'vitest';
import { createDashboardMailClient } from '../client';
import { jsonResponse } from './test-helpers';

describe('createDashboardMailClient', () => {
  it('sends the service token, subject and workspace headers for the bound user', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    const dashboard = createDashboardMailClient({
      baseUrl: 'https://mail.test.internal',
      serviceToken: 'svc_dashboard_token',
      fetch: fetchMock as unknown as typeof fetch,
      validateResponses: false,
    });

    const client = dashboard.forUser({ subject: 'auth-brain|person_1', workspaceId: 'wrk_opuntia' });
    await client.workspace.get();

    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer svc_dashboard_token');
    expect(headers.get('x-mail-subject')).toBe('auth-brain|person_1');
    expect(headers.get('x-mail-workspace')).toBe('wrk_opuntia');
  });

  it('binds a fresh set of headers per forUser() call, never leaking one person into another', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    const dashboard = createDashboardMailClient({
      baseUrl: 'https://mail.test.internal',
      serviceToken: 'svc_dashboard_token',
      fetch: fetchMock as unknown as typeof fetch,
      validateResponses: false,
    });

    await dashboard.forUser({ subject: 'person_1', workspaceId: 'wrk_a' }).workspace.get();
    await dashboard.forUser({ subject: 'person_2', workspaceId: 'wrk_b' }).workspace.get();

    const first = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    const second = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers);
    expect(first.get('x-mail-subject')).toBe('person_1');
    expect(second.get('x-mail-subject')).toBe('person_2');
  });

  it('omits x-mail-workspace for a `dashboard`-access call with no workspace yet (workspaces.create)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, {}));
    const dashboard = createDashboardMailClient({
      baseUrl: 'https://mail.test.internal',
      serviceToken: 'svc_dashboard_token',
      fetch: fetchMock as unknown as typeof fetch,
      validateResponses: false,
    });

    // No workspaceId: this person has none yet, they are about to create the first one.
    const client = dashboard.forUser({ subject: 'auth-brain|person_1' });
    await client.workspaces.create({
      slug: 'opuntia',
      name: 'ŌPUNTIA',
      owner: { email: 'admin@example.com', name: 'Admin' },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/workspaces');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('x-mail-subject')).toBe('auth-brain|person_1');
    expect(headers.has('x-mail-workspace')).toBe(false);
  });

  it('lists the signed-in person\'s workspaces via workspaces.list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: [], next_cursor: null }));
    const dashboard = createDashboardMailClient({
      baseUrl: 'https://mail.test.internal',
      serviceToken: 'svc_dashboard_token',
      fetch: fetchMock as unknown as typeof fetch,
      validateResponses: false,
    });

    const result = await dashboard.forUser({ subject: 'auth-brain|person_1' }).workspaces.list();
    expect(result).toEqual({ data: [], next_cursor: null });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/workspaces');
  });

  it('refuses to construct in a browser-like global (has a `window`)', () => {
    const globalWithWindow = globalThis as unknown as { window?: unknown };
    const hadWindow = 'window' in globalWithWindow;
    const previous = globalWithWindow.window;
    globalWithWindow.window = {};
    try {
      expect(() =>
        createDashboardMailClient({ baseUrl: 'https://mail.test.internal', serviceToken: 'svc_x' }),
      ).toThrow(/must never run in a browser/);
    } finally {
      if (hadWindow) globalWithWindow.window = previous;
      else delete globalWithWindow.window;
    }
  });
});
