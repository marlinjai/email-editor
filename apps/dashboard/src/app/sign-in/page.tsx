import type { Metadata } from 'next';
import { SignInWithLumitra } from '@marlinjai/auth-brain-nextjs/signin';
import { auth } from '@/lib/auth';
import { BrandMark } from '@/components/brand';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in' };

/**
 * The public sign-in landing. An unauthenticated navigation arrives here after
 * a silent sign-in attempt found no auth.lumitra.co session; the button opens
 * auth-brain's sign-in in a popup (falling back to a plain link when a popup is
 * blocked or JavaScript is off). Carries no workspace data.
 */
function safeReturnTo(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/sign-in') && !v.startsWith('/api/')) return v;
  return '/';
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string | string[] }> }) {
  const { return_to } = await searchParams;
  const href = auth.loginUrl(safeReturnTo(return_to));
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[400px]">
        <BrandMark size={44} />
        <h1 className="mt-8 text-[26px] font-semibold tracking-[-0.025em]">Lumitra Mail</h1>
        <p className="mt-2 text-[14.5px] text-muted">
          Templates, mailings and delivery for your company. Sign in with your Lumitra account to continue.
        </p>
        <div className="mt-8">
          <SignInWithLumitra href={href} mode="popup" />
        </div>
        <p className="mt-10 text-[12.5px] text-faint">
          Access is granted per company. If your company uses Lumitra Mail and you cannot get in, ask its owner.
        </p>
      </div>
    </main>
  );
}
