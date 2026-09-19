import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { ImportView } from './view';

export const metadata: Metadata = { title: 'Import MJML' };

export default async function ImportMjmlPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/templates`} className="text-[12.5px] text-muted hover:text-ink">
          ← All templates
        </Link>
      </div>
      <PageHeader
        title="Import MJML"
        description="Bring a mail written in MJML into the editor. You see how it will look and what could not become an editable block before anything is saved."
      />
      {can(role, 'write') ? (
        <ImportView ws={ws} />
      ) : (
        <ErrorPanel
          title="Your role cannot create templates"
          message="Importing creates a template. Ask an editor, admin or owner of this workspace."
          action={<LinkButton href={`/w/${ws}/templates`}>Back to templates</LinkButton>}
        />
      )}
    </>
  );
}
