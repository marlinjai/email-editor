import type { Metadata } from 'next';
import { RECIPIENT_STATUSES, type RecipientStatus } from '@marlinjai/mail-sdk';
import { ErrorPanel, LinkButton } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { viewerEmail } from '@/lib/viewer-email';
import { workspaceContext } from '@/lib/workspace';
import { MailingView } from './view';

export const metadata: Metadata = { title: 'Mailing' };

export default async function MailingPage({
  params,
  searchParams,
}: {
  params: Promise<{ ws: string; id: string }>;
  searchParams: Promise<{ rstatus?: string; rcursor?: string }>;
}) {
  const { ws, id } = await params;
  const sp = await searchParams;
  const rstatus = RECIPIENT_STATUSES.includes(sp.rstatus as RecipientStatus) ? (sp.rstatus as RecipientStatus) : undefined;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';

  const mailing = await act('mailings.get', async () => (await mail(ws)).api.mailings.get(id));
  if (!mailing.ok) {
    return (
      <ErrorPanel
        title="This mailing could not be opened"
        message={mailing.error.message}
        requestId={mailing.error.requestId}
        action={<LinkButton href={`/w/${ws}/mailings`}>Back to mailings</LinkButton>}
      />
    );
  }

  // Each part loads on its own: one failing never hides the mailing itself.
  const [lookups, recipients, compiled, lastTest, unknown] = await Promise.all([
    act('mailings.lookups', async () => {
      const { api } = await mail(ws);
      const [topics, providers, templates] = await Promise.all([
        api.topics.list({ limit: 100 }),
        api.providers.list({ limit: 100 }),
        api.templates.list({ archived: 'false', limit: 100 }),
      ]);
      return { topics: topics.data, providers: providers.data, templates: templates.data };
    }),
    act('mailings.listRecipients', async () => (await mail(ws)).api.mailings.listRecipients(id, { status: rstatus, limit: 50, cursor: sp.rcursor })),
    act('mailings.compile', async () => (await mail(ws)).api.compile({ document: mailing.data.document })),
    act('messages.latestTest', async () => {
      const { api } = await mail(ws);
      for await (const m of api.paginate('messages.list', { query: { mailing_id: id, limit: 100 } })) if (m.is_test) return m;
      return null;
    }),
    act('mailings.outcomeUnknown', async () => {
      const page = await (await mail(ws)).api.mailings.listRecipients(id, { status: 'skipped', skip_reason: 'outcome_unknown', limit: 100 });
      return page.data.length;
    }),
  ]);

  return (
    <MailingView
      ws={ws}
      initial={mailing.data}
      canWrite={can(role, 'write')}
      viewerEmail={await viewerEmail()}
      lookups={lookups}
      recipients={recipients}
      recipientFilter={rstatus ?? null}
      compiled={compiled}
      lastTest={lastTest.ok ? lastTest.data : null}
      outcomeUnknown={unknown.ok ? unknown.data : 0}
    />
  );
}
