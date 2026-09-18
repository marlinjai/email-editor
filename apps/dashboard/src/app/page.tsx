import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ErrorPanel, LinkButton } from '@/components/ui';
import { requireViewer } from '@/lib/viewer';
import { LAST_WORKSPACE_COOKIE, listMyWorkspaces } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

/**
 * The front door: the workspace the person used last (if they still belong to
 * it), else their first, else creating one.
 */
export default async function Home() {
  await requireViewer('/');
  const list = await listMyWorkspaces();
  if (!list.ok) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <ErrorPanel title="Your workspaces could not be loaded" message={list.error.message} requestId={list.error.requestId} action={<LinkButton href="/">Try again</LinkButton>} />
      </main>
    );
  }
  if (list.data.length === 0) redirect('/workspaces/new?first=1');
  const last = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
  const target = list.data.find((w) => w.id === last) ?? list.data[0]!;
  redirect(`/w/${target.id}`);
}
