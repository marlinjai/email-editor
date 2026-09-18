import 'server-only';
import type { MemberRole } from '@marlinjai/mail-sdk';
import { auth } from './auth';
import { signInvite, verifyInvite, type InviteCheck } from './invite-token';

/** The invitation signing key's root: the dashboard's session secret (a sub-key is derived from it). */
function inviteSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const err = new Error('AUTH_SESSION_SECRET is not set');
    err.name = 'DashboardConfigError';
    throw err;
  }
  return secret;
}

export function createInvite(input: { workspaceId: string; inviterSubject: string; email: string; role: MemberRole }): { url: string; expiresAt: string } {
  const { token, payload } = signInvite(input, inviteSecret());
  return { url: `${auth.appUrl()}/invite/${token}`, expiresAt: new Date(payload.x).toISOString() };
}

export function readInvite(token: string): InviteCheck {
  return verifyInvite(token, inviteSecret());
}
