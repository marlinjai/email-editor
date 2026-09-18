import type { Metadata } from 'next';
import { BrandMark } from '@/components/brand';
import { ErrorPanel, LinkButton } from '@/components/ui';
import { readInvite } from '@/lib/invites';
import { ROLE_LABELS } from '@/lib/roles';
import { requireViewer } from '@/lib/viewer';
import { AcceptInvite } from './accept';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invitation' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await requireViewer(`/invite/${token}`);
  const check = readInvite(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-6 py-16">
      <BrandMark size={40} />
      {!check.ok ? (
        <div className="mt-8">
          <ErrorPanel
            title={check.reason === 'expired' ? 'This invitation has expired' : 'This invitation link is not valid'}
            message={check.reason === 'expired' ? 'Invitations are valid for seven days. Ask the person who invited you for a new one.' : 'Check that the whole link was copied, or ask for a new one.'}
            action={<LinkButton href="/">Go to my workspaces</LinkButton>}
          />
        </div>
      ) : check.payload.e !== viewer.email.toLowerCase() ? (
        <div className="mt-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Invitation for another address</h1>
          <p className="mt-2 text-[14px] text-muted">
            This invitation is for <span className="text-ink">{check.payload.e}</span>, and you are signed in as{' '}
            <span className="text-ink">{viewer.email}</span>. Sign out and sign in with the invited address to accept it.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Join a workspace</h1>
          <p className="mt-2 text-[14px] text-muted">
            You have been invited to a Lumitra Mail workspace as <span className="text-ink">{ROLE_LABELS[check.payload.r]}</span>.
          </p>
          <div className="mt-8">
            <AcceptInvite token={token} />
          </div>
        </div>
      )}
    </main>
  );
}
