import Link from 'next/link';
import type { Metadata } from 'next';
import { IMPORT_TERMINAL_STATUSES } from '@marlinjai/mail-sdk';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { ImportView } from './view';

export const metadata: Metadata = { title: 'Import' };

export default async function ImportPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const back = `/w/${ws}/contacts/imports`;
  const job = await act('imports.get', async () => (await mail(ws)).api.imports.get(id));
  if (!job.ok) {
    return (
      <ErrorPanel
        title="This import could not be opened"
        message={job.error.message}
        requestId={job.error.requestId}
        action={<LinkButton href={back}>Back to imports</LinkButton>}
      />
    );
  }
  const j = job.data;
  const hasRows = (j.status === 'validated' && j.dry_run !== null) || (IMPORT_TERMINAL_STATUSES.includes(j.status) && j.result !== null);
  const [lookups, rows] = await Promise.all([
    act('imports.lookups', async () => {
      const { api } = await mail(ws);
      const collect = async <T,>(it: AsyncGenerator<T>) => {
        const all: T[] = [];
        for await (const x of it) all.push(x);
        return all;
      };
      const [topics, tags, properties] = await Promise.all([
        collect(api.paginate('topics.list', { query: { limit: 100 } })),
        collect(api.paginate('tags.list', { query: { limit: 100 } })),
        api.contactProperties.list(),
      ]);
      return { topics, tags, properties: properties.data };
    }),
    hasRows ? act('imports.rows', async () => (await mail(ws)).api.imports.rows(id, { limit: 50 })) : Promise.resolve(null),
  ]);
  if (!lookups.ok) return <ErrorPanel title="This import could not be opened" message={lookups.error.message} requestId={lookups.error.requestId} />;
  return (
    <>
      <div className="mb-2">
        <Link href={back} className="text-[12.5px] text-muted hover:text-ink">
          ← Imports
        </Link>
      </div>
      <PageHeader title={j.file_name ?? 'Import'} />
      <ImportView
        key={j.id}
        ws={ws}
        initial={j}
        lookups={lookups.data}
        rows={rows && rows.ok ? rows.data : null}
        canWrite={can(role, 'write')}
      />
    </>
  );
}
