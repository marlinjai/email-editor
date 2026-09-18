import 'server-only';
import { createDashboardMailClient, type DashboardMailClient, type MailClient } from '@marlinjai/mail-sdk';
import { requireViewer, type Viewer } from './viewer';

/**
 * The mail service client, server-side only. It authenticates with the
 * dashboard's service token (`DASHBOARD_SERVICE_TOKEN`) and names the signed-in
 * person's auth-brain subject and the workspace on every call; the service
 * checks that person's membership and role each time. Neither the token nor any
 * workspace API key ever reaches the browser: `server-only` makes importing
 * this module from a client component a build error.
 */
let dashboard: DashboardMailClient | null = null;
let uploads: DashboardMailClient | null = null;

export class DashboardConfigError extends Error {
  constructor(name: string) {
    super(`${name} is not set: the dashboard cannot reach the mail service.`);
    this.name = 'DashboardConfigError';
  }
}

function settings(): { baseUrl: string; serviceToken: string } {
  const baseUrl = process.env.MAIL_SERVICE_URL;
  const serviceToken = process.env.DASHBOARD_SERVICE_TOKEN;
  if (!baseUrl) throw new DashboardConfigError('MAIL_SERVICE_URL');
  if (!serviceToken) throw new DashboardConfigError('DASHBOARD_SERVICE_TOKEN');
  return { baseUrl, serviceToken };
}

function client(): DashboardMailClient {
  dashboard ??= createDashboardMailClient({ ...settings(), userAgent: 'lumitra-mail-dashboard' });
  return dashboard;
}

/**
 * For the one call that carries a large file (a CSV import of up to 50 MB,
 * which the service parses before it answers): a longer per-attempt timeout
 * and a single retry, so a slow upload is neither cut off at 10 seconds nor
 * sent four times.
 */
function uploadClient(): DashboardMailClient {
  uploads ??= createDashboardMailClient({ ...settings(), userAgent: 'lumitra-mail-dashboard', timeoutMs: 120_000, maxRetries: 1 });
  return uploads;
}

/** Test-only: forget the cached client so a unit test can swap the environment. */
export function resetMailClientForTests(): void {
  dashboard = null;
  uploads = null;
}

/** A client acting for the signed-in person, bound to one workspace (or none, for listing and creating). */
export async function mail(workspaceId?: string): Promise<{ api: MailClient; viewer: Viewer }> {
  const viewer = await requireViewer();
  return { api: client().forUser({ subject: viewer.subject, workspaceId }), viewer };
}

/** Like {@link mail}, for a large upload (see uploadClient). */
export async function mailForUpload(workspaceId: string): Promise<{ api: MailClient; viewer: Viewer }> {
  const viewer = await requireViewer();
  return { api: uploadClient().forUser({ subject: viewer.subject, workspaceId }), viewer };
}
