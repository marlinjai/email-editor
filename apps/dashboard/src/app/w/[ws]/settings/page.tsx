import type { Metadata } from 'next';
import { ErrorPanel, Section } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { workspacePlan } from '@/lib/plan';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { GeneralForm, TrackingForm } from './general-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function GeneralSettings({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  if (!ctx.ok || !ctx.data) return <ErrorPanel message={ctx.ok ? 'The workspace could not be found.' : ctx.error.message} />;
  const { workspace, role } = ctx.data;
  const [tracking, plan] = await Promise.all([act('tracking.get', async () => (await mail(ws)).api.tracking.get()), workspacePlan(ws)]);
  return (
    <>
      <GeneralForm
        ws={ws}
        canEdit={can(role, 'admin')}
        initial={{
          name: workspace.name,
          slug: workspace.slug,
          locales: workspace.settings.locales,
          defaultLocale: workspace.settings.default_locale,
          assetPolicy: workspace.settings.asset_policy,
        }}
      />
      <div className="mt-8">
        <Section title="Tracking" description="What the service records when a mail is opened or a link in it is clicked.">
          {tracking.ok ? (
            <TrackingForm
              ws={ws}
              initial={tracking.data}
              canEdit={can(role, 'admin')}
              plan={plan.ok ? { name: plan.data.name, included: plan.data.features.tracking } : null}
            />
          ) : (
            <ErrorPanel
              title="Tracking settings could not be loaded"
              message={tracking.error.message}
              requestId={tracking.error.requestId}
            />
          )}
        </Section>
      </div>
    </>
  );
}
