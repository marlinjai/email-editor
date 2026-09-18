'use server';

import { MailApiError } from '@marlinjai/mail-sdk';
import { act, DashboardRefusal } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

const REFUSALS: Record<string, string> = {
  email_mismatch: 'This invitation is for another address. Sign out and sign in with the address it was sent to.',
  inviter_lacks_role: 'The person who invited you can no longer add members with this role. Ask them, or another admin, for a new invitation.',
  expired: 'This invitation has expired. Ask for a new one.',
  revoked: 'This invitation was withdrawn. Ask for a new one if you still need access.',
  accepted: 'This invitation was already used. Ask for a new one.',
};

/**
 * Accepts an invitation for the signed-in person. The service checks the rest:
 * the address matches, the invitation is pending, and the inviter may still
 * grant the role. Accepting again, once in, is a success.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ workspaceId: string; alreadyMember: boolean }>> {
  return act('invites.accept', async () => {
    const { api, viewer } = await mail();
    try {
      const accepted = await api.invites.accept({ token, email: viewer.email, name: viewer.name });
      return { workspaceId: accepted.workspace.id, alreadyMember: accepted.already_member };
    } catch (err) {
      if (err instanceof MailApiError) {
        const reason = typeof err.details?.reason === 'string' ? err.details.reason : null;
        if (reason && REFUSALS[reason]) throw new DashboardRefusal(err.code, REFUSALS[reason]);
        if (err.code === 'not_found') throw new DashboardRefusal('not_found', 'This invitation link is not valid. Check that the whole link was copied.');
      }
      throw err;
    }
  });
}
