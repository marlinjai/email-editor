import { Shell } from '@/components/shell';
import { ErrorPanel, LinkButton } from '@/components/ui';
import { auth } from '@/lib/auth';
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

  return (
    <Shell
      current={{ id: ctx.data.workspace.id, name: ctx.data.workspace.name, role: ctx.data.role }}
      workspaces={ctx.data.memberships.map((w) => ({ id: w.id, name: w.name, role: w.role }))}
      email={viewer.email}
      signOutHref={auth.logoutUrl('/')}
    >
      {children}
    </Shell>
  );
}
