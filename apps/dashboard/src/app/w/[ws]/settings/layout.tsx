import { PageHeader } from '@/components/ui';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { SubTabs } from '@/components/tabs';

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const base = `/w/${ws}/settings`;
  const tabs = [
    { href: base, label: 'General' },
    { href: `${base}/members`, label: 'Members' },
    ...(can(role, 'admin') ? [{ href: `${base}/api-keys`, label: 'API keys' }] : []),
    { href: `${base}/providers`, label: 'Providers' },
    { href: `${base}/topics`, label: 'Topics' },
    ...(can(role, 'admin') ? [{ href: `${base}/webhooks`, label: 'Webhooks' }] : []),
    { href: `${base}/billing`, label: 'Billing' },
  ];
  return (
    <>
      <PageHeader title="Settings" description="How this workspace sends, who can use it, and how your own applications connect to it." />
      <SubTabs label="Settings" tabs={tabs} />
      <div className="pt-6">{children}</div>
    </>
  );
}
