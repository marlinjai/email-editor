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

export class DashboardConfigError extends Error {
  constructor(name: string) {
    super(`${name} is not set: the dashboard cannot reach the mail service.`);
    this.name = 'DashboardConfigError';
  }
}

function client(): DashboardMailClient {
  if (dashboard) return dashboard;
  const baseUrl = process.env.MAIL_SERVICE_URL;
  const serviceToken = process.env.DASHBOARD_SERVICE_TOKEN;
  if (!baseUrl) throw new DashboardConfigError('MAIL_SERVICE_URL');
  if (!serviceToken) throw new DashboardConfigError('DASHBOARD_SERVICE_TOKEN');
  dashboard = createDashboardMailClient({ baseUrl, serviceToken, userAgent: 'lumitra-mail-dashboard' });
  return dashboard;
}

/** Test-only: forget the cached client so a unit test can swap the environment. */
export function resetMailClientForTests(): void {
  dashboard = null;
}

/**
 * A client acting for someone other than the signed-in person. Used in exactly
 * one place: accepting an invitation, where the dashboard adds the invitee on
 * behalf of the admin who signed the invitation (src/app/invite). The service
 * checks that admin's role in the workspace on the call.
 */
export function mailOnBehalfOf(subject: string, workspaceId: string): MailClient {
  return client().forUser({ subject, workspaceId });
}

/** A client acting for the signed-in person, bound to one workspace (or none, for listing and creating). */
export async function mail(workspaceId?: string): Promise<{ api: MailClient; viewer: Viewer }> {
  const viewer = await requireViewer();
  return { api: client().forUser({ subject: viewer.subject, workspaceId }), viewer };
}
