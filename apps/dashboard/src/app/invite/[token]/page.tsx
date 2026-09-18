import type { Metadata } from 'next';
import { BrandMark } from '@/components/brand';
import { requireViewer } from '@/lib/viewer';
import { AcceptInvite } from './accept';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invitation' };

/**
 * Where an invitation link lands. The token is only ever checked by the
 * service, on acceptance, so this page asks for nothing but the click; every
 * refusal (another address, expired, withdrawn, already used) is explained
 * when it happens.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await requireViewer(`/invite/${token}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-6 py-16">
      <BrandMark size={40} />
      <h1 className="mt-8 text-[22px] font-semibold tracking-[-0.02em]">Join a workspace</h1>
      <p className="mt-2 text-[14px] text-muted">
        You have been invited to a Lumitra Mail workspace. You are signed in as <span className="text-ink">{viewer.email}</span>; the invitation
        must have been sent to this address.
      </p>
      <div className="mt-8">
        <AcceptInvite token={token} />
      </div>
    </main>
  );
}
