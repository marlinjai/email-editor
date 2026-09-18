import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MemberRole } from '@marlinjai/mail-contract';

/**
 * Invitation tokens: how a workspace admin brings someone in without the
 * dashboard ever looking a person up by email (the mail service binds members
 * by auth-brain subject, and only auth-brain's admin API could resolve an
 * email to one).
 *
 * The token carries the workspace, the inviter's subject, the invited address,
 * the role and an expiry, signed with HMAC-SHA256 under a key derived from the
 * dashboard's session secret. Accepting it adds the signed-in person on the
 * inviter's behalf, so the mail service re-checks at that moment that the
 * inviter may still add members (and grant that role). Pure: no Next, no env.
 */

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MEMBER_ROLES: readonly MemberRole[] = ['owner', 'admin', 'editor', 'viewer'];

export type InvitePayload = {
  v: 1;
  /** Workspace id. */
  w: string;
  /** The inviter's auth-brain subject. */
  s: string;
  /** The invited address, lowercased. */
  e: string;
  r: MemberRole;
  /** Expiry, milliseconds since the epoch. */
  x: number;
  /** A random id: the idempotency key of the acceptance. */
  n: string;
};

function key(secret: string): Buffer {
  return createHmac('sha256', secret).update('lumitra-mail-dashboard/invite/v1').digest();
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', key(secret)).update(body).digest('base64url');
}

export function signInvite(
  input: { workspaceId: string; inviterSubject: string; email: string; role: MemberRole },
  secret: string,
  now = Date.now(),
): { token: string; payload: InvitePayload } {
  const payload: InvitePayload = {
    v: 1,
    w: input.workspaceId,
    s: input.inviterSubject,
    e: input.email.trim().toLowerCase(),
    r: input.role,
    x: now + INVITE_TTL_MS,
    n: randomBytes(12).toString('base64url'),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${body}.${sign(body, secret)}`, payload };
}

export type InviteCheck = { ok: true; payload: InvitePayload } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyInvite(token: string, secret: string, now = Date.now()): InviteCheck {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts as [string, string];
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
  let payload: InvitePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InvitePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    payload?.v !== 1 ||
    typeof payload.w !== 'string' ||
    typeof payload.s !== 'string' ||
    typeof payload.e !== 'string' ||
    typeof payload.n !== 'string' ||
    typeof payload.x !== 'number' ||
    !MEMBER_ROLES.includes(payload.r)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.x <= now) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}
