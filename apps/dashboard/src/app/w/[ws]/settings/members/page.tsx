import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { workspaceContext } from '@/lib/workspace';
import { MembersView } from './view';

export const metadata: Metadata = { title: 'Members' };

export default async function MembersPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const members = await act('members.list', async () => {
    const { api, viewer } = await mail(ws);
    const all = [];
    for await (const m of api.paginate('members.list', { query: { limit: 100 } })) all.push(m);
    return { members: all, me: viewer.subject };
  });
  if (!members.ok)
    return <ErrorPanel title="Members could not be loaded" message={members.error.message} requestId={members.error.requestId} />;
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  return <MembersView ws={ws} members={members.data.members} me={members.data.me} myRole={role} />;
}
