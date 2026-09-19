import Link from 'next/link';
import type { Metadata } from 'next';
import { ErrorPanel, PageHeader } from '@/components/ui';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { SignupFormEditor } from '../editor';
import { formLookups } from '../lookups';

export const metadata: Metadata = { title: 'New signup form' };

export default async function NewSignupFormPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const [ctx, lookups] = await Promise.all([workspaceContext(ws), formLookups(ws)]);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/contacts/forms`} className="text-[12.5px] text-muted hover:text-ink">
          ← Signup forms
        </Link>
      </div>
      <PageHeader title="New signup form" />
      {lookups.ok ? (
        <SignupFormEditor ws={ws} form={null} lookups={lookups.data} canAdmin={can(role, 'admin')} />
      ) : (
        <ErrorPanel title="The form could not be loaded" message={lookups.error.message} requestId={lookups.error.requestId} />
      )}
    </>
  );
}
