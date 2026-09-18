'use server';

import { MailApiError } from '@marlinjai/mail-sdk';
import { act, DashboardRefusal } from '@/lib/action';
import { readInvite } from '@/lib/invites';
import { mailOnBehalfOf } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';
import { requireViewer } from '@/lib/viewer';

/**
 * Accepts an invitation for the signed-in person. The link must be genuine,
 * unexpired and addressed to the person's own email; the mail service then
 * adds them on the inviter's behalf and checks the inviter's role. Accepting
 * twice (a double click, a second tab) is a success, not an error.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ workspaceId: string }>> {
  return act('invites.accept', async () => {
    const viewer = await requireViewer(`/invite/${token}`);
    const check = readInvite(token);
    if (!check.ok) {
      throw new DashboardRefusal(
        'invalid_request',
        check.reason === 'expired'
          ? 'This invitation has expired. Ask for a new one.'
          : 'This invitation link is not valid. Check that it was copied completely.',
      );
    }
    const invite = check.payload;
    if (invite.e !== viewer.email.toLowerCase()) {
      throw new DashboardRefusal(
        'forbidden',
        `This invitation is for ${invite.e}, and you are signed in as ${viewer.email}. Sign out and sign in with the invited address.`,
      );
    }
    try {
      await mailOnBehalfOf(invite.s, invite.w).members.add(
        { subject: viewer.subject, email: viewer.email, name: viewer.name, role: invite.r },
        { idempotencyKey: `invite-${invite.n}-${viewer.subject}`.slice(0, 255) },
      );
    } catch (err) {
      if (err instanceof MailApiError && err.code === 'already_exists') return { workspaceId: invite.w };
      if (err instanceof MailApiError && (err.code === 'forbidden' || err.code === 'insufficient_role' || err.code === 'not_found')) {
        throw new DashboardRefusal(
          'forbidden',
          'The person who invited you can no longer add members to this workspace, or it no longer exists. Ask for a new invitation.',
        );
      }
      throw err;
    }
    return { workspaceId: invite.w };
  });
}
