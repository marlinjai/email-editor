import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ui';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { GeneralForm } from './general-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function GeneralSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  if (!ctx.ok || !ctx.data) return <ErrorPanel message={ctx.ok ? 'The workspace could not be found.' : ctx.error.message} />;
  const { workspace, role } = ctx.data;
  return (
    <GeneralForm
      ws={ws}
      canEdit={can(role, 'admin')}
      initial={{
        name: workspace.name,
        slug: workspace.slug,
        locales: workspace.settings.locales,
        defaultLocale: workspace.settings.default_locale,
        trackingEnabled: workspace.settings.tracking_enabled,
      }}
    />
  );
}
