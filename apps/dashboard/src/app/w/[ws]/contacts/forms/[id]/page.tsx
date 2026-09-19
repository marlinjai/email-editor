import Link from 'next/link';
import type { Metadata } from 'next';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { EmbedPanel, SignupFormEditor } from '../editor';
import { formLookups } from '../lookups';

export const metadata: Metadata = { title: 'Signup form' };

export default async function SignupFormPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const back = `/w/${ws}/contacts/forms`;
  const [ctx, form, embed, lookups] = await Promise.all([
    workspaceContext(ws),
    act('signupForms.get', async () => (await mail(ws)).api.signupForms.get(id)),
    act('signupForms.embed', async () => (await mail(ws)).api.signupForms.embed(id)),
    formLookups(ws),
  ]);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  if (!form.ok) {
    return (
      <ErrorPanel
        title="This signup form could not be opened"
        message={form.error.message}
        requestId={form.error.requestId}
        action={<LinkButton href={back}>Back to signup forms</LinkButton>}
      />
    );
  }
  return (
    <>
      <div className="mb-2">
        <Link href={back} className="text-[12.5px] text-muted hover:text-ink">
          ← Signup forms
        </Link>
      </div>
      <PageHeader title={form.data.name} />
      <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
        {lookups.ok ? (
          <SignupFormEditor key={form.data.version} ws={ws} form={form.data} lookups={lookups.data} canAdmin={can(role, 'admin')} />
        ) : (
          <ErrorPanel title="The form could not be loaded" message={lookups.error.message} requestId={lookups.error.requestId} />
        )}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          {embed.ok ? (
            <EmbedPanel embed={embed.data} />
          ) : (
            <ErrorPanel title="The embed code could not be loaded" message={embed.error.message} requestId={embed.error.requestId} />
          )}
        </aside>
      </div>
    </>
  );
}
