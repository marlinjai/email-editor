import { Shell } from '@/components/shell';
import { ErrorPanel, LinkButton } from '@/components/ui';
import { act } from '@/lib/action';
import { auth } from '@/lib/auth';
import { mail } from '@/lib/mail';
import { requireViewer } from '@/lib/viewer';
import { workspaceContext } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const viewer = await requireViewer(`/w/${ws}`);
  const ctx = await workspaceContext(ws);

  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <ErrorPanel
          title="Your workspaces could not be loaded"
          message={ctx.error.message}
          requestId={ctx.error.requestId}
          action={<LinkButton href={`/w/${ws}`}>Try again</LinkButton>}
        />
      </main>
    );
  }
  if (!ctx.data) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <h1 className="text-[20px] font-semibold">Not a workspace of yours</h1>
        <p className="mt-2 text-[14px] text-muted">
          This workspace does not exist, or you are not a member of it. If someone invited you, open the invitation link they sent while
          signed in as {viewer.email}.
        </p>
        <LinkButton href="/" variant="primary" className="mt-6">
          Go to my workspaces
        </LinkButton>
      </main>
    );
  }

  // The plan's warnings for the banner (read access, so every member sees
  // them). Advisory: when usage cannot be read the page still renders, and
  // the failure is logged by `act`.
  const usage = await act('billing.usage', async () => (await mail(ws)).api.billing.usage());

  return (
    <Shell
      usageWarnings={usage.ok ? usage.data.warnings : []}
      current={{ id: ctx.data.workspace.id, name: ctx.data.workspace.name, role: ctx.data.role }}
      workspaces={ctx.data.memberships.map((w) => ({ id: w.id, name: w.name, role: w.role }))}
      email={viewer.email}
      signOutHref={auth.logoutUrl('/')}
    >
      {children}
    </Shell>
  );
}
