import type { Metadata } from 'next';
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry, type Member } from '@marlinjai/mail-sdk';
import { EmptyState, ErrorPanel, LinkButton, Mono, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { AuditFilter } from './filter';

export const metadata: Metadata = { title: 'Audit log' };

function actorLabel(entry: AuditEntry, members: Map<string, Member>): string {
  const a = entry.actor;
  if (a.type === 'member') return members.get(a.member_id)?.email ?? 'a former member';
  if (a.type === 'api_key') return 'an API key';
  return `the service (${a.reason})`;
}

/** Who did what, when: every change in the workspace, newest first. Admins and owners only. */
export default async function AuditPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ action?: string; cursor?: string }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const action = AUDIT_ACTIONS.includes(sp.action as AuditAction) ? (sp.action as AuditAction) : undefined;
  const data = await act('audit.list', async () => {
    const { api } = await mail(ws);
    const [entries, members] = await Promise.all([api.auditLog.list({ action, limit: 50, cursor: sp.cursor }), api.members.list({ limit: 100 })]);
    return { entries, members: members.data };
  });
  const base = `/w/${ws}/audit`;
  return (
    <>
      <PageHeader title="Audit log" description="Every change in this workspace, by whom and when. Kept as long as the workspace exists." actions={<AuditFilter base={base} action={action ?? ''} />} />
      {!data.ok ? (
        <ErrorPanel
          title="The audit log could not be loaded"
          message={data.error.code === 'insufficient_role' ? 'Only admins and owners can read the audit log.' : data.error.message}
          requestId={data.error.requestId}
        />
      ) : data.data.entries.data.length === 0 ? (
        <EmptyState title={action ? 'No entries of that kind' : 'Nothing recorded yet'} />
      ) : (
        <>
          <Table label="Audit log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>What</Th>
                <Th>Who</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.data.entries.data.map((e) => {
                const members = new Map(data.data.members.map((m) => [m.id, m]));
                const details = Object.entries(e.details);
                return (
                  <tr key={e.id}>
                    <Td>
                      <When at={e.created_at} />
                    </Td>
                    <Td>
                      <Mono className="text-ink">{e.action}</Mono>
                    </Td>
                    <Td className="text-muted">{actorLabel(e, members)}</Td>
                    <Td className="max-w-[48ch]">
                      {details.length === 0 ? (
                        <span className="text-faint">none</span>
                      ) : (
                        <span className="block truncate font-mono text-[12px] text-muted" title={JSON.stringify(e.details)}>
                          {details.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {data.data.entries.next_cursor ? (
            <div className="mt-3 flex justify-end">
              <LinkButton href={`${base}?${new URLSearchParams({ ...(action ? { action } : {}), cursor: data.data.entries.next_cursor })}`}>Older entries</LinkButton>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
