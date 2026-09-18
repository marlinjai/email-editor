import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { BrandMark } from '@/components/brand';
import { buttonClass } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'No access' };

/**
 * Where a person lands who signed in but none of whose companies holds the
 * `mail` app grant. The wrong-account case is the usual one, so the way out is
 * signing out and in with another account.
 */
export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[420px]">
        <BrandMark size={44} />
        <h1 className="mt-8 text-[24px] font-semibold tracking-[-0.025em]">No access to Lumitra Mail</h1>
        <p className="mt-2 text-[14.5px] text-muted">
          You are signed in, but none of your companies has Lumitra Mail enabled. If you have another Lumitra account that does, sign out and sign in with that one. Otherwise ask your company&apos;s owner to enable Lumitra Mail.
        </p>
        <a href={auth.logoutUrl('/')} className={buttonClass('primary', 'mt-8')}>
          Sign out
        </a>
      </div>
    </main>
  );
}
