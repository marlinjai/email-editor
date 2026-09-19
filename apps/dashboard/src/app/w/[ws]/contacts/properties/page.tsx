import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { PropertiesView } from './view';

export const metadata: Metadata = { title: 'Contact properties' };

export default async function PropertiesPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const list = await act('contactProperties.list', async () => (await mail(ws)).api.contactProperties.list());
  if (!list.ok) return <ErrorPanel title="Properties could not be loaded" message={list.error.message} requestId={list.error.requestId} />;
  return <PropertiesView ws={ws} properties={list.data.data} canAdmin={can(role, 'admin')} />;
}
