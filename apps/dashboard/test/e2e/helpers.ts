import { expect, type Page } from '@playwright/test';
import { createDashboardMailClient } from '@marlinjai/mail-sdk';
import { CONTROL_URL, DASHBOARD_TOKEN, SERVICE_URL, SMTP_PASSWORD, SMTP_USER, type SinkMessage } from './stack';

export type Identity = { subject: string; email: string; name: string | null; companies: Array<{ id: string; name: string }> };

export const OWNER: Identity = { subject: 'e2e-owner', email: 'owner@example.com', name: 'Olive Owner', companies: [{ id: 'tenant-e2e', name: 'E2E Company' }] };
export const EDITOR: Identity = { subject: 'e2e-editor', email: 'editor@example.com', name: 'Eddie Editor', companies: [{ id: 'tenant-e2e', name: 'E2E Company' }] };

/** Signs a browser context in as a test identity (only a non-production dashboard accepts this). */
export async function signIn(page: Page, who: Identity) {
  const res = await page.request.post('/api/test-auth/sign-in', { data: who });
  expect(res.ok()).toBe(true);
}

/** The service as the dashboard sees it, for seeding and for checking what the UI did. */
export function serviceFor(who: Identity, workspaceId?: string) {
  return createDashboardMailClient({ baseUrl: SERVICE_URL, serviceToken: DASHBOARD_TOKEN }).forUser({ subject: who.subject, workspaceId });
}

export async function sink(): Promise<{ port: number; messages: SinkMessage[] }> {
  return (await fetch(`${CONTROL_URL}/smtp/messages`)).json();
}

export async function configureSink(options: { delayMs?: number; reject?: string[] }) {
  await fetch(`${CONTROL_URL}/smtp/configure`, { method: 'POST', body: JSON.stringify(options) });
}

export async function restartService(signal: 'SIGKILL' | 'SIGTERM' = 'SIGKILL') {
  const res = await fetch(`${CONTROL_URL}/service/restart`, { method: 'POST', body: JSON.stringify({ signal }) });
  expect(res.ok).toBe(true);
}

/** Puts a workspace on a plan directly in the database, as an operator does for a design partner. */
export async function setPlan(workspaceId: string, plan: 'free' | 'design_partner') {
  const res = await fetch(`${CONTROL_URL}/billing/plan`, { method: 'POST', body: JSON.stringify({ workspaceId, plan }) });
  expect(res.ok).toBe(true);
}

export const SMTP_LOGIN = { user: SMTP_USER, password: SMTP_PASSWORD };

const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A template document with an unsubscribe link and an image, in the editor's schema. */
export function newsletterDocument(greeting: string) {
  return {
    version: '1.0' as const,
    metadata: { title: greeting },
    sections: [
      {
        id: 'sec-1',
        type: 'section',
        columns: [
          {
            id: 'col-1',
            blocks: [
              // Inline, so the canvas renders it at size without any network.
              { id: 'img-1', type: 'image', src: PLACEHOLDER_PNG, alt: 'Placeholder', width: '120px', height: '40px', align: 'center' },
              { id: 'txt-1', type: 'text', content: `<p>${greeting}, {{first_name}}!</p>` },
              { id: 'txt-2', type: 'text', content: '<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
            ],
          },
        ],
      },
    ],
  };
}

/** Polls the service until a mailing reaches one of the statuses. */
export async function waitForMailing(who: Identity, workspaceId: string, mailingId: string, statuses: string[], timeoutMs = 60_000) {
  const api = serviceFor(who, workspaceId);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const m = await api.mailings.get(mailingId);
    if (statuses.includes(m.status)) return m;
    if (Date.now() > deadline) throw new Error(`mailing stayed ${m.status}, expected ${statuses.join(' or ')}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** The workspace id from a /w/<id>/... URL. */
export function workspaceIdOf(page: Page): string {
  const m = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname);
  if (!m) throw new Error(`not on a workspace page: ${page.url()}`);
  return m[1]!;
}
