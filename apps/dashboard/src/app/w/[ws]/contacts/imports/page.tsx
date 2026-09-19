import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, EmptyState, ErrorPanel, PageHeader, Section, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { formatBytes, formatCount } from '@/lib/format';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { IMPORT_STATUS } from './status';
import { UploadForm } from './upload';

export const metadata: Metadata = { title: 'Imports' };

export default async function ImportsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const imports = await act('imports.list', async () => (await mail(ws)).api.imports.list({ limit: 50 }));
  const base = `/w/${ws}/contacts/imports`;
  return (
    <>
      <PageHeader
        title="Imports"
        description="Bring contacts in from a CSV file: map its columns, see exactly what an import would do in a dry run, then import. Suppressed addresses are never subscribed, and importing the same file again changes nothing."
      />
      {can(role, 'write') ? (
        <div className="mb-8">
          <UploadForm ws={ws} />
        </div>
      ) : null}
      <Section title="Earlier imports">
        {!imports.ok ? (
          <ErrorPanel title="Imports could not be loaded" message={imports.error.message} requestId={imports.error.requestId} />
        ) : imports.data.data.length === 0 ? (
          <EmptyState title="No imports yet">An import starts with a CSV file that has a header row and a column of email addresses.</EmptyState>
        ) : (
          <Table label="Imports">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Status</Th>
                <Th className="text-right">Rows</Th>
                <Th>Started</Th>
              </tr>
            </thead>
            <tbody>
              {imports.data.data.map((job) => (
                <tr key={job.id}>
                  <Td>
                    <Link href={`${base}/${job.id}`} className="text-ink hover:text-gold">
                      {job.file_name ?? 'Unnamed file'}
                    </Link>
                    <span className="block text-[12px] text-faint">{formatBytes(job.file_bytes)}</span>
                  </Td>
                  <Td>
                    <Badge tone={IMPORT_STATUS[job.status].tone}>{IMPORT_STATUS[job.status].label}</Badge>
                  </Td>
                  <Td className="tabular text-right">{formatCount(job.total_rows)}</Td>
                  <Td>
                    <When at={job.created_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
