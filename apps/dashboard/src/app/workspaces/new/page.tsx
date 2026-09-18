import type { Metadata } from 'next';
import { BrandMark } from '@/components/brand';
import { LinkButton } from '@/components/ui';
import { requireViewer } from '@/lib/viewer';
import { listMyWorkspaces } from '@/lib/workspace';
import { CreateWorkspaceForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New workspace' };

export default async function NewWorkspacePage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const viewer = await requireViewer('/workspaces/new');
  const { first } = await searchParams;
  const list = await listMyWorkspaces();
  const hasAny = list.ok && list.data.length > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-6 py-16">
      <BrandMark size={40} />
      <h1 className="mt-8 text-[24px] font-semibold tracking-[-0.025em]">{first && !hasAny ? 'Create your first workspace' : 'New workspace'}</h1>
      <p className="mt-2 text-[14px] text-muted">
        A workspace holds one sender&apos;s templates, contacts, mailings and settings. You will be its owner and can invite others afterwards.
      </p>
      <div className="mt-8">
        <CreateWorkspaceForm companies={viewer.companies} defaultCompanyId={viewer.activeCompanyId} />
      </div>
      {hasAny ? (
        <LinkButton href="/" variant="ghost" className="mt-4 self-start">
          Back to my workspaces
        </LinkButton>
      ) : null}
    </main>
  );
}
